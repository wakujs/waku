import type { ReactNode } from 'react';
import type { unstable_defineRouter } from '../define-router.js';
import {
  type PathSpec,
  pathSpecAsString,
} from '../isomorphic-utils/path-spec.js';
import type { Unstable_SearchCodec } from '../isomorphic-utils/search-codec.js';

export type ApiHandler = (
  req: Request,
  apiContext: { params: Record<string, string | string[]> },
) => Promise<Response>;

export type HandlerInterceptor = NonNullable<
  Parameters<typeof unstable_defineRouter>[0]['unstable_interceptors']
>[number];

export type SlotId = string;

export type RendererOption = { routePath: string; query: string | undefined };

export type GetEtagFromOption = (
  option: RendererOption,
) => Promise<string | undefined>;
export type GetEtagFromParams = (
  params?: Record<string, string | string[]>,
) => Promise<string | undefined>;

export type RouteConfig = {
  type: 'route';
  pathSpec: PathSpec;
  isStatic: boolean;
  pathPatternSpec?: PathSpec;
  rootElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
    getEtagFromOption?: GetEtagFromOption;
    sourceFile?: string;
  };
  routeElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
    getEtagFromOption?: GetEtagFromOption;
  };
  elements: Record<
    SlotId,
    {
      isStatic: boolean;
      renderer: (option: RendererOption) => ReactNode;
      getEtagFromOption?: GetEtagFromOption;
      sourceFile?: string;
    }
  >;
  noSsr?: boolean;
  slices?: string[];
  searchCodec?: Unstable_SearchCodec<any>;
};

type ApiConfig = {
  type: 'api';
  pathSpec: PathSpec;
  isStatic: boolean;
  handler: ApiHandler;
  sourceFile?: string;
};
export type ApiConfigForTest = ApiConfig;

export type SliceConfig = {
  type: 'slice';
  id: string;
  pathSpec?: PathSpec;
  isStatic: boolean;
  renderer: (params?: Record<string, string | string[]>) => Promise<ReactNode>;
  getEtagFromParams?: GetEtagFromParams;
  sourceFile?: string;
};

export type RuntimeConfig = RouteConfig | ApiConfig | SliceConfig;

type SerializableRouteConfig = Omit<
  RouteConfig,
  'rootElement' | 'routeElement' | 'elements' | 'searchCodec'
> & {
  rootElement: Omit<
    RouteConfig['rootElement'],
    'renderer' | 'getEtagFromOption'
  >;
  routeElement: Omit<
    RouteConfig['routeElement'],
    'renderer' | 'getEtagFromOption'
  >;
  elements: Record<
    SlotId,
    Omit<RouteConfig['elements'][string], 'renderer' | 'getEtagFromOption'>
  >;
};
export type SerializableRouteConfigForTest = SerializableRouteConfig;

export type SerializableApiConfig = Omit<ApiConfig, 'handler'>;

export type SerializableSliceConfig = Omit<
  SliceConfig,
  'renderer' | 'getEtagFromParams'
>;

export type SerializableConfig =
  SerializableRouteConfig | SerializableApiConfig | SerializableSliceConfig;

export const CREATE_PAGES_CONFIGS_KEY = 'createPages:serializableConfigs';

export const getPathSpecKey = (p: PathSpec) => JSON.stringify(p);

export const toSerializable = (c: RuntimeConfig): SerializableConfig => {
  if (c.type === 'route') {
    const {
      rootElement,
      routeElement,
      elements,
      searchCodec: _searchCodec,
      ...rest
    } = c;
    const {
      renderer: _rootRenderer,
      getEtagFromOption: _rootGetEtag,
      ...rootElementRest
    } = rootElement;
    const {
      renderer: _routeRenderer,
      getEtagFromOption: _routeGetEtag,
      ...routeElementRest
    } = routeElement;
    return {
      ...rest,
      rootElement: rootElementRest,
      routeElement: routeElementRest,
      elements: Object.fromEntries(
        Object.entries(elements).map(
          ([id, { renderer: _r, getEtagFromOption: _g, ...elRest }]) => [
            id,
            elRest,
          ],
        ),
      ),
    };
  }
  if (c.type === 'api') {
    const { handler: _handler, ...rest } = c;
    return rest;
  }
  const { renderer: _r, getEtagFromParams: _g, ...rest } = c;
  return rest;
};

const throwMissingRuntimeFunction = (what: string): never => {
  throw new Error(
    `defineRouter: no runtime function found for ${what}; rebuild required`,
  );
};

// `rootElement.renderer` and per-id element renderers are shared
// across routes - any one is a valid fallback for another.
export const mergeWithRuntimeConfigs = (
  serializableConfigs: SerializableConfig[],
  runtimeConfigs: RuntimeConfig[],
): RuntimeConfig[] => {
  const runtimeRouteByPath = new Map<string, RouteConfig>();
  const runtimeApiByPath = new Map<string, ApiConfig>();
  const runtimeSliceById = new Map<string, SliceConfig>();
  for (const c of runtimeConfigs) {
    if (c.type === 'route') {
      runtimeRouteByPath.set(getPathSpecKey(c.pathSpec), c);
    } else if (c.type === 'api') {
      runtimeApiByPath.set(getPathSpecKey(c.pathSpec), c);
    } else {
      runtimeSliceById.set(c.id, c);
    }
  }
  const sharedRootRenderer = runtimeConfigs.find(
    (c): c is RouteConfig => c.type === 'route',
  )?.rootElement.renderer;
  const sharedElementRenderers = new Map<
    SlotId,
    RouteConfig['elements'][string]['renderer']
  >();
  for (const c of runtimeConfigs) {
    if (c.type !== 'route') {
      continue;
    }
    for (const [id, el] of Object.entries(c.elements)) {
      if (!sharedElementRenderers.has(id)) {
        sharedElementRenderers.set(id, el.renderer);
      }
    }
  }
  return serializableConfigs.map((c) => {
    if (c.type === 'route') {
      const runtimeItem = runtimeRouteByPath.get(getPathSpecKey(c.pathSpec));
      const label = `route ${pathSpecAsString(c.pathSpec)}`;
      const elements: RouteConfig['elements'] = {};
      for (const [id, val] of Object.entries(c.elements)) {
        const elementSpec = runtimeItem?.elements[id];
        elements[id] = {
          isStatic: val.isStatic,
          renderer:
            elementSpec?.renderer ??
            sharedElementRenderers.get(id) ??
            (() => throwMissingRuntimeFunction(`element "${id}" of ${label}`)),
          ...(elementSpec?.getEtagFromOption
            ? { getEtagFromOption: elementSpec.getEtagFromOption }
            : {}),
          ...(val.sourceFile ? { sourceFile: val.sourceFile } : {}),
        };
      }
      return {
        type: 'route',
        pathSpec: c.pathSpec,
        isStatic: c.isStatic,
        ...(c.pathPatternSpec !== undefined
          ? { pathPatternSpec: c.pathPatternSpec }
          : {}),
        rootElement: {
          isStatic: c.rootElement.isStatic,
          renderer:
            runtimeItem?.rootElement.renderer ??
            sharedRootRenderer ??
            (() => throwMissingRuntimeFunction(`rootElement of ${label}`)),
          ...(runtimeItem?.rootElement.getEtagFromOption
            ? { getEtagFromOption: runtimeItem.rootElement.getEtagFromOption }
            : {}),
          ...(c.rootElement.sourceFile
            ? { sourceFile: c.rootElement.sourceFile }
            : {}),
        },
        routeElement: {
          isStatic: c.routeElement.isStatic,
          renderer:
            runtimeItem?.routeElement.renderer ??
            (() => throwMissingRuntimeFunction(`routeElement of ${label}`)),
          ...(runtimeItem?.routeElement.getEtagFromOption
            ? { getEtagFromOption: runtimeItem.routeElement.getEtagFromOption }
            : {}),
        },
        elements,
        ...(c.noSsr !== undefined ? { noSsr: c.noSsr } : {}),
        ...(c.slices !== undefined ? { slices: c.slices } : {}),
        ...(runtimeItem?.searchCodec !== undefined
          ? { searchCodec: runtimeItem.searchCodec }
          : {}),
      };
    }
    if (c.type === 'api') {
      const runtimeItem = runtimeApiByPath.get(getPathSpecKey(c.pathSpec));
      return {
        type: 'api',
        pathSpec: c.pathSpec,
        isStatic: c.isStatic,
        handler:
          runtimeItem?.handler ??
          (async () =>
            throwMissingRuntimeFunction(`api ${pathSpecAsString(c.pathSpec)}`)),
        ...(c.sourceFile ? { sourceFile: c.sourceFile } : {}),
      };
    }
    const runtimeItem = runtimeSliceById.get(c.id);
    return {
      type: 'slice',
      id: c.id,
      ...(c.pathSpec !== undefined ? { pathSpec: c.pathSpec } : {}),
      isStatic: c.isStatic,
      renderer:
        runtimeItem?.renderer ??
        (async () => throwMissingRuntimeFunction(`slice ${c.id}`)),
      ...(runtimeItem?.getEtagFromParams
        ? { getEtagFromParams: runtimeItem.getEtagFromParams }
        : {}),
      ...(c.sourceFile ? { sourceFile: c.sourceFile } : {}),
    };
  });
};
