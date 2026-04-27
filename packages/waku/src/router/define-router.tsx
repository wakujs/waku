import type { ReactNode } from 'react';
import { createCustomError, getErrorInfo } from '../lib/utils/custom-errors.js';
import {
  getPathMapping,
  path2regexp,
  pathSpecAsString,
} from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToStream,
  streamToBytes,
} from '../lib/utils/stream.js';
import { createTaskRunner } from '../lib/utils/task-runner.js';
import { unstable_defineHandlers as defineHandlers } from '../minimal/server.js';
import { unstable_getContext as getContext } from '../server.js';
import { INTERNAL_ServerRouter } from './client.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  SKIP_HEADER,
  decodeRoutePath,
  decodeSliceId,
  encodeRoutePath,
  encodeSliceId,
  pathnameToRoutePath,
} from './common.js';

export type ApiHandler = (
  req: Request,
  apiContext: { params: Record<string, string | string[]> },
) => Promise<Response>;

const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((y) => typeof y === 'string');

const parseRscParams = (
  rscParams: unknown,
): {
  query: string;
} => {
  if (rscParams instanceof URLSearchParams) {
    return { query: rscParams.get('query') || '' };
  }
  if (
    typeof (rscParams as { query?: undefined } | undefined)?.query === 'string'
  ) {
    return { query: (rscParams as { query: string }).query };
  }
  return { query: '' };
};

const RSC_PATH_SYMBOL = Symbol('RSC_PATH');
const RSC_PARAMS_SYMBOL = Symbol('RSC_PARAMS');

const setRscPath = (rscPath: string) => {
  try {
    const context = getContext();
    (context as unknown as Record<typeof RSC_PATH_SYMBOL, unknown>)[
      RSC_PATH_SYMBOL
    ] = rscPath;
  } catch {
    // ignore
  }
};

const setRscParams = (rscParams: unknown) => {
  try {
    const context = getContext();
    (context as unknown as Record<typeof RSC_PARAMS_SYMBOL, unknown>)[
      RSC_PARAMS_SYMBOL
    ] = rscParams;
  } catch {
    // ignore
  }
};

export function unstable_getRscPath(): string | undefined {
  try {
    const context = getContext();
    return (context as unknown as Record<typeof RSC_PATH_SYMBOL, string>)[
      RSC_PATH_SYMBOL
    ];
  } catch {
    return undefined;
  }
}

export function unstable_getRscParams(): unknown {
  try {
    const context = getContext();
    return (context as unknown as Record<typeof RSC_PARAMS_SYMBOL, unknown>)[
      RSC_PARAMS_SYMBOL
    ];
  } catch {
    return undefined;
  }
}

const getNonce = () => {
  try {
    const context = getContext();
    return context.nonce;
  } catch {
    return undefined;
  }
};

const RERENDER_SYMBOL = Symbol('RERENDER');
type Rerender = (rscPath: string, rscParams?: unknown) => void;

const setRerender = (rerender: Rerender) => {
  try {
    const context = getContext();
    (context as unknown as Record<typeof RERENDER_SYMBOL, Rerender>)[
      RERENDER_SYMBOL
    ] = rerender;
  } catch {
    // ignore
  }
};

const getRerender = (): Rerender => {
  const context = getContext();
  return (context as unknown as Record<typeof RERENDER_SYMBOL, Rerender>)[
    RERENDER_SYMBOL
  ];
};

const is404 = (pathSpec: PathSpec) =>
  pathSpec.length === 1 &&
  pathSpec[0]!.type === 'literal' &&
  pathSpec[0]!.name === '404';

const pathSpecToRoutePath = (pathSpec: PathSpec) => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    return undefined;
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

const routePathToHtmlFilePath = (routePath: string): string =>
  routePath === '/404' ? '404.html' : routePath + '/index.html';

export function unstable_rerenderRoute(pathname: string, query?: string) {
  const routePath = pathnameToRoutePath(pathname);
  const rscPath = encodeRoutePath(routePath);
  getRerender()(rscPath, query && new URLSearchParams({ query }));
}

export function unstable_notFound(): never {
  throw createCustomError('Not Found', { status: 404 });
}

export function unstable_redirect(
  location: string, // only URL `pathname` is supported.
  status: 303 | 307 | 308 = 307,
): never {
  throw createCustomError('Redirect', { status, location });
}

type SlotId = string;

const ROOT_SLOT_ID = 'root';
const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

const assertNonReservedSlotId = (slotId: SlotId) => {
  if (
    slotId === ROOT_SLOT_ID ||
    slotId.startsWith(ROUTE_SLOT_ID_PREFIX) ||
    slotId.startsWith(SLICE_SLOT_ID_PREFIX)
  ) {
    throw new Error('Element ID cannot be "root", "route:*" or "slice:*"');
  }
};

type RendererOption = { routePath: string; query: string | undefined };

type RouteConfig = {
  type: 'route';
  path: PathSpec;
  isStatic: boolean;
  pathPattern?: PathSpec;
  rootElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
  };
  routeElement: {
    isStatic: boolean;
    renderer: (option: RendererOption) => ReactNode;
  };
  elements: Record<
    SlotId,
    {
      isStatic: boolean;
      renderer: (option: RendererOption) => ReactNode;
    }
  >;
  noSsr?: boolean;
  slices?: string[];
};

type ApiConfig = {
  type: 'api';
  path: PathSpec;
  isStatic: boolean;
  handler: ApiHandler;
};

type SliceConfig = {
  type: 'slice';
  id: string;
  pathSpec?: PathSpec;
  isStatic: boolean;
  renderer: (params?: Record<string, string | string[]>) => Promise<ReactNode>;
};

type RuntimeConfig = RouteConfig | ApiConfig | SliceConfig;

type SerializableRouteConfig = Omit<
  RouteConfig,
  'rootElement' | 'routeElement' | 'elements'
> & {
  rootElement: Omit<RouteConfig['rootElement'], 'renderer'>;
  routeElement: Omit<RouteConfig['routeElement'], 'renderer'>;
  elements: Record<SlotId, Omit<RouteConfig['elements'][string], 'renderer'>>;
};

type SerializableApiConfig = Omit<ApiConfig, 'handler'>;

type SerializableSliceConfig = Omit<SliceConfig, 'renderer'>;

type SerializableConfig =
  | SerializableRouteConfig
  | SerializableApiConfig
  | SerializableSliceConfig;

const toSerializable = (
  c: RuntimeConfig,
): SerializableConfig => {
  if (c.type === 'route') {
    const { rootElement, routeElement, elements, ...rest } = c;
    const {
      renderer: _rootRenderer,
      ...rootElementRest
    } = rootElement;
    const {
      renderer: _routeRenderer,
      ...routeElementRest
    } = routeElement;
    return {
      ...rest,
      rootElement: rootElementRest,
      routeElement: routeElementRest,
      elements: Object.fromEntries(
        Object.entries(elements).map(([id, { renderer: _r, ...elRest }]) => [
          id,
          elRest,
        ]),
      ),
    };
  }
  if (c.type === 'api') {
    const { handler: _handler, ...rest } = c;
    return rest;
  }
  const { renderer: _renderer, ...rest } = c;
  return rest;
};

const pathSpecKey = (p: PathSpec) => JSON.stringify(p);

const mergeWithSerializableConfigs = (
  runtimeConfigs: RuntimeConfig[],
  serializableConfigs: SerializableConfig[],
): RuntimeConfig[] => {
  const runtimeRouteByPath = new Map<string, RouteConfig>();
  const runtimeApiByPath = new Map<string, ApiConfig>();
  const runtimeSliceById = new Map<string, SliceConfig>();
  for (const c of runtimeConfigs) {
    if (c.type === 'route') {
      runtimeRouteByPath.set(pathSpecKey(c.path), c);
    } else if (c.type === 'api') {
      runtimeApiByPath.set(pathSpecKey(c.path), c);
    } else {
      runtimeSliceById.set(c.id, c);
    }
  }
  return serializableConfigs.map((c) => {
    if (c.type === 'route') {
      const runtimeItem = runtimeRouteByPath.get(pathSpecKey(c.path));
      if (!runtimeItem) {
        throw new Error(
          `defineRouter: missing runtime route for ${pathSpecAsString(c.path)} (build/runtime drift)`,
        );
      }
      const elements: RouteConfig['elements'] = {};
      for (const [id, val] of Object.entries(c.elements)) {
        const runtimeEl = runtimeItem.elements[id];
        if (!runtimeEl) {
          throw new Error(
            `defineRouter: missing runtime element ${id} for ${pathSpecAsString(c.path)}`,
          );
        }
        elements[id] = { isStatic: val.isStatic, renderer: runtimeEl.renderer };
      }
      return {
        type: 'route',
        path: c.path,
        isStatic: c.isStatic,
        ...(c.pathPattern !== undefined ? { pathPattern: c.pathPattern } : {}),
        rootElement: {
          isStatic: c.rootElement.isStatic,
          renderer: runtimeItem.rootElement.renderer,
        },
        routeElement: {
          isStatic: c.routeElement.isStatic,
          renderer: runtimeItem.routeElement.renderer,
        },
        elements,
        ...(c.noSsr !== undefined ? { noSsr: c.noSsr } : {}),
        ...(c.slices !== undefined ? { slices: c.slices } : {}),
      };
    }
    if (c.type === 'api') {
      const runtimeItem = runtimeApiByPath.get(pathSpecKey(c.path));
      if (!runtimeItem) {
        throw new Error(
          `defineRouter: missing runtime api for ${pathSpecAsString(c.path)} (build/runtime drift)`,
        );
      }
      return {
        type: 'api',
        path: c.path,
        isStatic: c.isStatic,
        handler: runtimeItem.handler,
      };
    }
    const runtimeItem = runtimeSliceById.get(c.id);
    if (!runtimeItem) {
      throw new Error(
        `defineRouter: missing runtime slice ${c.id} (build/runtime drift)`,
      );
    }
    return {
      type: 'slice',
      id: c.id,
      ...(c.pathSpec !== undefined ? { pathSpec: c.pathSpec } : {}),
      isStatic: c.isStatic,
      renderer: runtimeItem.renderer,
    };
  });
};

const getRouterPrefetchCode = (path2moduleIds: Record<string, string[]>) => {
  const moduleIdSet = new Set<string>();
  Object.values(path2moduleIds).forEach((ids) =>
    ids.forEach((id) => moduleIdSet.add(id)),
  );
  const ids = Array.from(moduleIdSet);
  const path2idxs: Record<string, number[]> = {};
  Object.entries(path2moduleIds).forEach(([path, ids]) => {
    path2idxs[path] = ids.map((id) => ids.indexOf(id));
  });
  return `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path, callback) => {
  const ids = ${JSON.stringify(ids)};
  const path2idxs = ${JSON.stringify(path2idxs)};
  const key = Object.keys(path2idxs).find((key) => new RegExp(key).test(path));
  for (const idx of path2idxs[key] || []) {
    callback(ids[idx]);
  }
};
`;
};

export function unstable_defineRouter(fns: {
  getConfigs: () => Promise<Iterable<RuntimeConfig>>;
  unstable_skipBuild?: (routePath: string) => boolean;
}) {
  let cachedConfigs: RuntimeConfig[] | undefined;

  const initConfigs = async (
    loadBuildMetadata?: (key: string) => Promise<string | undefined>,
  ) => {
    if (cachedConfigs) {
      return;
    }
    const runtimeConfigs = Array.from(await fns.getConfigs());
    runtimeConfigs.forEach((item) => {
      if (item.type === 'route') {
        Object.keys(item.elements).forEach(assertNonReservedSlotId);
      }
    });
    if (loadBuildMetadata) {
      const raw = await loadBuildMetadata(
        'defineRouter:serializableConfigs',
      );
      if (raw) {
        const serializableConfigs = JSON.parse(raw) as SerializableConfig[];
        cachedConfigs = mergeWithSerializableConfigs(
          runtimeConfigs,
          serializableConfigs,
        );
        return;
      }
    }
    cachedConfigs = runtimeConfigs;
  };

  const getCachedConfigs = (): RuntimeConfig[] => {
    if (!cachedConfigs) {
      throw new Error('defineRouter: configs not initialized');
    }
    return cachedConfigs;
  };

  const has404 = () =>
    getCachedConfigs().some(
      (item) => item.type === 'route' && is404(item.path),
    );

  const getPathConfigItem = (pathname: string) => {
    const routePath = pathnameToRoutePath(pathname);
    return getCachedConfigs().find(
      (item): item is typeof item & { type: 'route' | 'api' } =>
        (item.type === 'route' || item.type === 'api') &&
        !!getPathMapping(item.path, routePath),
    );
  };

  const getSliceElement = async (
    sliceConfig: {
      id: string;
      isStatic: boolean;
      renderer: (
        params?: Record<string, string | string[]>,
      ) => Promise<ReactNode>;
    },
    getCachedElement: (id: SlotId) => Promise<ReactNode> | undefined,
    setCachedElement: (id: SlotId, element: ReactNode) => Promise<void> | void,
    concreteId?: string,
    params?: Record<string, string | string[]>,
  ): Promise<ReactNode> => {
    const id = SLICE_SLOT_ID_PREFIX + (concreteId ?? sliceConfig.id);
    const cached = getCachedElement(id);
    if (cached) {
      return cached;
    }
    const element = await sliceConfig.renderer(params);
    if (sliceConfig.isStatic) {
      await setCachedElement(id, element);
      return getCachedElement(id);
    }
    return element;
  };

  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    headers: Readonly<Record<string, string>>,
    getCachedElement: (id: SlotId) => Promise<ReactNode> | undefined,
    setCachedElement: (id: SlotId, element: ReactNode) => Promise<void> | void,
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const routePath = decodeRoutePath(rscPath);
    const pathConfigItem = getPathConfigItem(routePath);
    if (pathConfigItem?.type !== 'route') {
      return null;
    }
    let skipParam: unknown;
    try {
      skipParam = JSON.parse(headers[SKIP_HEADER.toLowerCase()] || '');
    } catch {
      // ignore
    }
    const skipIdSet = new Set(isStringArray(skipParam) ? skipParam : []);
    const { query } = parseRscParams(rscParams);
    const routeId = ROUTE_SLOT_ID_PREFIX + routePath;
    const option: RendererOption = {
      routePath,
      query: pathConfigItem.isStatic ? undefined : query,
    };
    const configs = getCachedConfigs();
    const slices = pathConfigItem.slices || [];
    const sliceConfigMap = new Map<
      string,
      {
        id: string;
        isStatic: boolean;
        renderer: (
          params?: Record<string, string | string[]>,
        ) => Promise<ReactNode>;
      }
    >();
    slices.forEach((sliceId) => {
      const sliceConfig = configs.find(
        (item): item is typeof item & { type: 'slice' } =>
          item.type === 'slice' &&
          (item.id === sliceId ||
            (!!item.pathSpec &&
              !!getPathMapping(item.pathSpec, '/' + sliceId))),
      );
      if (sliceConfig) {
        sliceConfigMap.set(sliceId, sliceConfig);
      }
    });
    const entries: Record<SlotId, unknown> = {};
    await Promise.all([
      (async () => {
        if (!pathConfigItem.rootElement.isStatic) {
          entries[ROOT_SLOT_ID] = pathConfigItem.rootElement.renderer(option);
        } else if (!skipIdSet.has(ROOT_SLOT_ID)) {
          if (!getCachedElement(ROOT_SLOT_ID)) {
            await setCachedElement(
              ROOT_SLOT_ID,
              pathConfigItem.rootElement.renderer(option),
            );
          }
          entries[ROOT_SLOT_ID] = await getCachedElement(ROOT_SLOT_ID);
        }
      })(),
      (async () => {
        if (!pathConfigItem.routeElement.isStatic) {
          entries[routeId] = pathConfigItem.routeElement.renderer(option);
        } else if (!skipIdSet.has(routeId)) {
          if (!getCachedElement(routeId)) {
            await setCachedElement(
              routeId,
              pathConfigItem.routeElement.renderer(option),
            );
          }
          entries[routeId] = await getCachedElement(routeId);
        }
      })(),
      ...Object.entries(pathConfigItem.elements).map(
        async ([id, { isStatic }]) => {
          const renderer = pathConfigItem.elements[id]?.renderer;
          if (!isStatic) {
            entries[id] = renderer?.(option);
          } else if (!skipIdSet.has(id)) {
            if (!getCachedElement(id)) {
              await setCachedElement(id, renderer?.(option));
            }
            entries[id] = await getCachedElement(id);
          }
        },
      ),
      ...slices.map(async (sliceId) => {
        const id = SLICE_SLOT_ID_PREFIX + sliceId;
        const sliceConfig = sliceConfigMap.get(sliceId);
        if (!sliceConfig) {
          throw new Error(`Slice not found: ${sliceId}`);
        }
        if (sliceConfig.isStatic && skipIdSet.has(id)) {
          return null;
        }
        const sliceElement = await getSliceElement(
          sliceConfig,
          getCachedElement,
          setCachedElement,
        );
        entries[id] = sliceElement;
      }),
    ]);
    entries[ROUTE_ID] = [routePath, query];
    entries[IS_STATIC_ID] = pathConfigItem.isStatic;
    sliceConfigMap.forEach((sliceConfig, sliceId) => {
      if (sliceConfig.isStatic) {
        // FIXME: hard-coded for now
        entries[IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId] = true;
      }
    });
    if (has404()) {
      entries[HAS404_ID] = true;
    }
    return entries;
  };

  type HandleRequest = Parameters<typeof defineHandlers>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

  const cachedElementsForRequest = new Map<SlotId, Promise<Uint8Array>>();
  let cachedElementsForRequestInitialized = false;
  let cachedPath2moduleIds: Record<string, string[]> | undefined;

  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, renderRscForParse, parseRsc, renderHtml, loadBuildMetadata },
  ): Promise<ReadableStream | Response | 'fallback' | null | undefined> => {
    await initConfigs(loadBuildMetadata);
    const getCachedElement = (id: SlotId) => {
      const cachedBytes = cachedElementsForRequest.get(id);
      if (!cachedBytes) {
        return undefined;
      }
      return cachedBytes
        .then((bytes) => parseRsc(bytesToStream(bytes)))
        .then((parsed) => parsed[id]) as Promise<ReactNode>;
    };
    const setCachedElement = (id: SlotId, element: ReactNode) => {
      const cachedBytes = cachedElementsForRequest.get(id);
      if (cachedBytes) {
        return;
      }
      const bytes = renderRscForParse({ [id]: element }).then((rscStream) =>
        streamToBytes(rscStream),
      );
      cachedElementsForRequest.set(id, bytes);
    };
    if (!cachedElementsForRequestInitialized) {
      cachedElementsForRequestInitialized = true;
      const cachedElementsMetadata = await loadBuildMetadata(
        'defineRouter:cachedElements',
      );
      if (cachedElementsMetadata) {
        Object.entries(JSON.parse(cachedElementsMetadata)).forEach(
          ([id, str]) => {
            cachedElementsForRequest.set(
              id,
              Promise.resolve(base64ToBytes(str as string)),
            );
          },
        );
      }
    }
    const getPath2moduleIds = async () => {
      if (!cachedPath2moduleIds) {
        cachedPath2moduleIds = JSON.parse(
          (await loadBuildMetadata('defineRouter:path2moduleIds')) || '{}',
        );
      }
      return cachedPath2moduleIds!;
    };

    const pathConfigItem = getPathConfigItem(input.pathname);
    if (pathConfigItem?.type === 'api') {
      const url = new URL(input.req.url);
      url.pathname = input.pathname;
      const req = new Request(url, input.req);
      const params = getPathMapping(pathConfigItem.path, input.pathname) ?? {};
      return pathConfigItem.handler(req, { params });
    }

    const url = new URL(input.req.url);
    const headers = Object.fromEntries(input.req.headers.entries());
    if (input.type === 'component') {
      const sliceId = decodeSliceId(input.rscPath);
      if (sliceId !== null) {
        // LIMITATION: This is a single slice request.
        // Ideally, we should be able to respond with multiple slices in one request.
        let sliceConfig: SliceConfig | undefined;
        let sliceParams: Record<string, string | string[]> | undefined;
        for (const item of getCachedConfigs()) {
          if (item.type !== 'slice') {
            continue;
          }
          if (item.id === sliceId) {
            sliceConfig = item;
            break;
          }
          if (item.pathSpec) {
            const mapping = getPathMapping(item.pathSpec, '/' + sliceId);
            if (mapping) {
              sliceConfig = item;
              sliceParams = mapping;
              break;
            }
          }
        }
        if (!sliceConfig) {
          return null;
        }
        const sliceElement = await getSliceElement(
          sliceConfig,
          getCachedElement,
          setCachedElement,
          sliceId,
          sliceParams,
        );
        return renderRsc({
          [SLICE_SLOT_ID_PREFIX + sliceId]: sliceElement,
          ...(sliceConfig.isStatic
            ? {
                // FIXME: hard-coded for now
                [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId]: true,
              }
            : {}),
        });
      }
      const entries = await getEntriesForRoute(
        input.rscPath,
        input.rscParams,
        headers,
        getCachedElement,
        setCachedElement,
      );
      if (!entries) {
        return null;
      }
      return renderRsc(entries);
    }

    if (input.type === 'function') {
      let elementsPromise: Promise<Record<string, unknown>> = Promise.resolve(
        {},
      );
      let rendered = false;
      const rerender = (rscPath: string, rscParams?: unknown) => {
        if (rendered) {
          throw new Error('already rendered');
        }
        elementsPromise = Promise.all([
          elementsPromise,
          getEntriesForRoute(
            rscPath,
            rscParams,
            headers,
            getCachedElement,
            setCachedElement,
          ),
        ]).then(([oldElements, newElements]) => {
          if (newElements === null) {
            console.warn('getEntries returned null');
          }
          return {
            ...oldElements,
            ...newElements,
          };
        });
      };
      setRerender(rerender);
      try {
        const value = await input.fn(...input.args);
        return renderRsc({ ...(await elementsPromise), _value: value });
      } catch (e) {
        const info = getErrorInfo(e);
        if (info?.location) {
          const routePath = pathnameToRoutePath(info.location);
          const rscPath = encodeRoutePath(routePath);
          const entries = await getEntriesForRoute(
            rscPath,
            undefined,
            headers,
            getCachedElement,
            setCachedElement,
          );
          if (!entries) {
            unstable_notFound();
          }
          return renderRsc(entries);
        }
        throw e;
      } finally {
        rendered = true;
      }
    }

    if (input.type === 'action' || input.type === 'custom') {
      const renderIt = async (
        pathname: string,
        query: string,
        httpstatus = 200,
      ) => {
        const routePath = pathnameToRoutePath(pathname);
        const rscPath = encodeRoutePath(routePath);
        const rscParams = new URLSearchParams({ query });
        const entries = await getEntriesForRoute(
          rscPath,
          rscParams,
          headers,
          getCachedElement,
          setCachedElement,
        );
        if (!entries) {
          return null;
        }
        const path2moduleIds = await getPath2moduleIds();
        const html = (
          <INTERNAL_ServerRouter
            route={{ path: routePath, query, hash: '' }}
            httpstatus={httpstatus}
          />
        );
        const formState =
          input.type === 'action' ? await input.fn() : undefined;
        const nonce = getNonce();
        return renderHtml(await renderRsc(entries), html, {
          rscPath,
          formState,
          status: httpstatus,
          ...(nonce ? { nonce } : {}),
          unstable_extraScriptContent: getRouterPrefetchCode(path2moduleIds),
        });
      };
      const query = url.searchParams.toString();
      if (pathConfigItem?.type === 'route' && pathConfigItem.noSsr) {
        return 'fallback';
      }
      try {
        if (pathConfigItem) {
          return await renderIt(input.pathname, query);
        }
      } catch (e) {
        const info = getErrorInfo(e);
        if (info?.status !== 404) {
          throw e;
        }
      }
      if (has404()) {
        return renderIt('/404', '', 404);
      } else {
        return null;
      }
    }
  };

  const handleBuild: HandleBuild = async ({
    renderRsc,
    parseRsc,
    renderHtml,
    rscPath2pathname,
    saveBuildMetadata,
    withRequest,
    generateFile,
    generateDefaultHtml,
  }) => {
    await initConfigs();
    const configs = getCachedConfigs();
    const cachedElementsForBuild = new Map<SlotId, Promise<ReactNode>>();
    const serializedCachedElements = new Map<SlotId, string>();
    const getCachedElement = (id: SlotId) => cachedElementsForBuild.get(id);
    const setCachedElement = (id: SlotId, element: ReactNode) => {
      const cached = cachedElementsForBuild.get(id);
      if (cached) {
        return;
      }
      const teedStream = renderRsc({ [id]: element }).then((rscStream) =>
        rscStream.tee(),
      );
      const stream1 = teedStream.then(([s1]) => s1);
      const stream2 = teedStream.then(([, s2]) => s2);
      const copied = stream1.then(
        (rscStream) =>
          parseRsc(rscStream).then(
            (parsed) => parsed[id],
          ) as Promise<ReactNode>,
      );
      cachedElementsForBuild.set(id, copied);
      return stream2
        .then((rscStream) => streamToBytes(rscStream))
        .then((bytes) => {
          serializedCachedElements.set(id, bytesToBase64(bytes));
        });
    };

    // hard-coded concurrency limit
    const { runTask, waitForTasks } = createTaskRunner(500);
    const skipBuild = fns.unstable_skipBuild;

    // static api
    for (const item of configs) {
      if (item.type !== 'api') {
        continue;
      }
      if (!item.isStatic) {
        continue;
      }
      const routePath = pathSpecToRoutePath(item.path);
      if (!routePath) {
        continue;
      }
      if (skipBuild?.(routePath)) {
        continue;
      }
      const req = new Request(new URL(routePath, 'http://localhost:3000'));
      runTask(async () => {
        await withRequest(req, async () => {
          const res = await item.handler(req, { params: {} });
          await generateFile(routePath, res.body || '').catch((e) => {
            if (e instanceof Error && 'code' in e && e.code === 'EEXIST') {
              throw new Error(
                `the API route ${pathSpecAsString(item.path)} faced file-system conflicts when writing static responses, this often happens because of empty segments in "staticPaths".`,
                { cause: e },
              );
            }

            throw e;
          });
        });
      });
    }

    const path2moduleIds: Record<string, string[]> = {};
    const htmlRenderTasks = new Set<() => Promise<void>>();

    // for each route, cache static elements and generate files for full static route
    for (const item of configs) {
      if (item.type !== 'route') {
        continue;
      }
      const routePath = pathSpecToRoutePath(item.path);
      if (!routePath) {
        continue;
      }
      if (skipBuild?.(routePath)) {
        continue;
      }
      const rscPath = encodeRoutePath(routePath);
      const req = new Request(new URL(routePath, 'http://localhost:3000'));
      runTask(async () => {
        await withRequest(req, async () => {
          const entries = await getEntriesForRoute(
            rscPath,
            undefined,
            {},
            getCachedElement,
            setCachedElement,
          );
          if (!entries) {
            return;
          }
          if (!item.isStatic) {
            return;
          }
          for (const id of Object.keys(entries)) {
            const cached = getCachedElement(id);
            entries[id] = cached ? await cached : entries[id];
          }
          const moduleIds = new Set<string>();
          const stream = await renderRsc(entries, {
            unstable_clientModuleCallback: (ids) =>
              ids.forEach((id) => moduleIds.add(id)),
          });
          const [stream1, stream2] = stream.tee();
          await generateFile(rscPath2pathname(rscPath), stream1);
          path2moduleIds[path2regexp(item.pathPattern || item.path)] =
            Array.from(moduleIds);
          htmlRenderTasks.add(async () => {
            const html = (
              <INTERNAL_ServerRouter
                route={{ path: routePath, query: '', hash: '' }}
                httpstatus={is404(item.path) ? 404 : 200}
              />
            );
            const res = await renderHtml(stream2, html, {
              rscPath,
              unstable_extraScriptContent:
                getRouterPrefetchCode(path2moduleIds),
            });
            await generateFile(
              routePathToHtmlFilePath(routePath),
              res.body || '',
            );
          });
        });
      });
    }
    // HACK hopefully there is a better way than this
    await waitForTasks();
    htmlRenderTasks.forEach(runTask);

    // default html
    for (const item of configs) {
      if (item.type !== 'route') {
        continue;
      }
      if (item.noSsr) {
        const routePath = pathSpecToRoutePath(item.path);
        if (!routePath) {
          throw new Error('Pathname is required for noSsr routes on build');
        }
        if (skipBuild?.(routePath)) {
          continue;
        }
        runTask(async () => {
          await generateDefaultHtml(routePathToHtmlFilePath(routePath));
        });
      }
    }

    // static slice
    for (const item of configs) {
      if (item.type !== 'slice') {
        continue;
      }
      if (!item.isStatic) {
        continue;
      }
      if (item.pathSpec) {
        // Skip slug slices — we can't pre-build them
        continue;
      }
      const rscPath = encodeSliceId(item.id);
      // dummy req for slice which is not determined at build time
      const req = new Request(new URL('http://localhost:3000'));
      runTask(async () => {
        await withRequest(req, async () => {
          const sliceElement = await getSliceElement(
            item,
            getCachedElement,
            setCachedElement,
          );
          const body = await renderRsc({
            [SLICE_SLOT_ID_PREFIX + item.id]: sliceElement,
            // FIXME: hard-coded for now
            [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + item.id]: true,
          });
          await generateFile(rscPath2pathname(rscPath), body);
        });
      });
    }

    await waitForTasks();

    // TODO should we save serialized cached elements separately?
    await saveBuildMetadata(
      'defineRouter:cachedElements',
      JSON.stringify(Object.fromEntries(serializedCachedElements)),
    );
    await saveBuildMetadata(
      'defineRouter:path2moduleIds',
      JSON.stringify(path2moduleIds),
    );
    await saveBuildMetadata(
      'defineRouter:serializableConfigs',
      JSON.stringify(configs.map(toSerializable)),
    );
  };

  return Object.assign(defineHandlers({ handleRequest, handleBuild }), {
    unstable_getRouterConfigs: async () => {
      await initConfigs();
      return getCachedConfigs();
    },
  });
}
