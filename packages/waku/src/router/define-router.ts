import { createElement } from 'react';
import type { ReactNode } from 'react';

import {
  unstable_getPlatformData,
  unstable_setPlatformData,
  unstable_createAsyncIterable as createAsyncIterable,
} from '../server.js';
import { unstable_defineEntries as defineEntries } from '../minimal/server.js';
import {
  encodeRoutePath,
  decodeRoutePath,
  decodeSliceId,
  ROUTE_ID,
  IS_STATIC_ID,
  HAS404_ID,
  SKIP_HEADER,
} from './common.js';
import { getPathMapping, path2regexp } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { INTERNAL_ServerRouter } from './client.js';
import { getContext } from '../middleware/context.js';
import { stringToStream } from '../lib/utils/stream.js';
import { createCustomError, getErrorInfo } from '../lib/utils/custom-errors.js';

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

const pathSpec2pathname = (pathSpec: PathSpec) => {
  if (pathSpec.some(({ type }) => type !== 'literal')) {
    return undefined;
  }
  return '/' + pathSpec.map(({ name }) => name!).join('/');
};

export function unstable_rerenderRoute(pathname: string, query?: string) {
  const rscPath = encodeRoutePath(pathname);
  getRerender()(rscPath, query && new URLSearchParams({ query }));
}

export function unstable_notFound(): never {
  throw createCustomError('Not Found', { status: 404 });
}

export function unstable_redirect(
  location: string,
  status: 303 | 307 | 308 = 307,
): never {
  throw createCustomError('Redirect', { status, location });
}

type SlotId = string;
type SliceId = string;

const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

export function unstable_defineRouter(fns: {
  getConfig: () => Promise<
    Iterable<
      | {
          type: 'route';
          path: PathSpec;
          pathPattern?: PathSpec;
          rootElement: { isStatic?: boolean };
          routeElement: { isStatic?: boolean };
          elements: Record<SlotId, { isStatic?: boolean }>;
          slices?: Record<SliceId, { isStatic?: boolean }>;
          noSsr?: boolean;
        }
      | {
          type: 'api';
          path: PathSpec;
          isStatic?: boolean;
        }
    >
  >;
  handleRoute: (
    path: string,
    options: {
      query?: string;
    },
  ) => Promise<{
    rootElement: ReactNode;
    routeElement: ReactNode;
    elements: Record<SlotId, unknown>;
  }>;
  // TODO: Not sure if this API is well designed. Let's revisit it later.
  handleSlice?: (sliceId: string) => Promise<{
    element: ReactNode;
    isStatic?: boolean; // This flag is only used for delayed slices.
  }>;
  handleApi?: (
    path: string,
    options: {
      url: URL;
      body: ReadableStream | null;
      headers: Readonly<Record<string, string>>;
      method: string;
    },
  ) => Promise<{
    body?: ReadableStream;
    headers?: Record<string, string | string[]>;
    status?: number;
  }>;
}) {
  type MyPathConfig = {
    pathSpec: PathSpec;
    pathname: string | undefined;
    pattern: string;
    specs: {
      rootElementIsStatic?: true;
      routeElementIsStatic?: true;
      staticElementIds?: SlotId[];
      sliceIds?: SliceId[];
      staticSliceIds?: SliceId[];
      isStatic?: true;
      noSsr?: true;
      is404?: true;
      isApi?: true;
    };
  }[];
  let cachedPathConfig: MyPathConfig | undefined;
  const getMyPathConfig = async (): Promise<MyPathConfig> => {
    const pathConfig = await unstable_getPlatformData(
      'defineRouterPathConfigs',
    );
    if (pathConfig) {
      return pathConfig as MyPathConfig;
    }
    if (!cachedPathConfig) {
      cachedPathConfig = Array.from(await fns.getConfig()).map((item) => {
        switch (item.type) {
          case 'route': {
            const is404 =
              item.path.length === 1 &&
              item.path[0]!.type === 'literal' &&
              item.path[0]!.name === '404';
            const isStatic =
              !!item.rootElement.isStatic &&
              !!item.routeElement.isStatic &&
              Object.values(item.elements).every((x) => x.isStatic);
            if (
              Object.keys(item.elements).some(
                (id) =>
                  id.startsWith(ROUTE_SLOT_ID_PREFIX) ||
                  id.startsWith(SLICE_SLOT_ID_PREFIX),
              )
            ) {
              throw new Error(
                'Element ID cannot start with "route:" or "slice:"',
              );
            }
            if (
              Object.keys(item.slices || {}).length &&
              !import.meta.env.VITE_EXPERIMENTAL_WAKU_ROUTER
            ) {
              throw new Error('Slice is still experimental');
            }
            return {
              pathSpec: item.path,
              pathname: pathSpec2pathname(item.path),
              pattern: path2regexp(item.pathPattern || item.path),
              specs: {
                ...(item.rootElement.isStatic
                  ? { rootElementIsStatic: true as const }
                  : {}),
                ...(item.routeElement.isStatic
                  ? { routeElementIsStatic: true as const }
                  : {}),
                staticElementIds: Object.entries(item.elements).flatMap(
                  ([id, { isStatic }]) => (isStatic ? [id] : []),
                ),
                ...(item.slices
                  ? {
                      sliceIds: Object.keys(item.slices),
                      staticSliceIds: Object.entries(item.slices).flatMap(
                        ([sliceId, { isStatic }]) =>
                          isStatic ? [sliceId] : [],
                      ),
                    }
                  : {}),
                ...(isStatic ? { isStatic: true as const } : {}),
                ...(is404 ? { is404: true as const } : {}),
                ...(item.noSsr ? { noSsr: true as const } : {}),
              },
            };
          }
          case 'api': {
            return {
              pathSpec: item.path,
              pathname: pathSpec2pathname(item.path),
              pattern: path2regexp(item.path),
              specs: {
                ...(item.isStatic ? { isStatic: true as const } : {}),
                isApi: true as const,
              },
            };
          }
          default:
            throw new Error('Unknown config type');
        }
      });
    }
    return cachedPathConfig;
  };
  const getPathConfigItem = async (pathname: string) => {
    const pathConfig = await getMyPathConfig();
    const found = pathConfig.find(({ pathSpec }) =>
      getPathMapping(pathSpec, pathname),
    );
    return found;
  };
  const has404 = async () => {
    const pathConfig = await getMyPathConfig();
    return pathConfig.some(({ specs: { is404 } }) => is404);
  };
  const getEntries = async (
    rscPath: string,
    rscParams: unknown,
    headers: Readonly<Record<string, string>>,
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const pathname = decodeRoutePath(rscPath);
    const pathConfigItem = await getPathConfigItem(pathname);
    if (!pathConfigItem) {
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
    const [{ rootElement, routeElement, elements }, ...slices] =
      await Promise.all([
        fns.handleRoute(
          pathname,
          pathConfigItem.specs.isStatic ? {} : { query },
        ),
        ...(pathConfigItem.specs.sliceIds || []).map(async (sliceId) => {
          if (
            fns.handleSlice &&
            !import.meta.env.VITE_EXPERIMENTAL_WAKU_ROUTER
          ) {
            throw new Error('Slice is still experimental');
          }
          if (!fns.handleSlice) {
            throw new Error('handleSlice is not defined');
          }
          const id = SLICE_SLOT_ID_PREFIX + sliceId;
          if (
            pathConfigItem.specs.staticSliceIds?.includes(sliceId) &&
            skipIdSet.has(id)
          ) {
            return {};
          }
          const { element } = await fns.handleSlice(sliceId);
          return { [id]: element };
        }),
      ]);
    if (
      Object.keys(elements).some(
        (id) =>
          id.startsWith(ROUTE_SLOT_ID_PREFIX) ||
          id.startsWith(SLICE_SLOT_ID_PREFIX),
      )
    ) {
      throw new Error('Element ID cannot start with "route:" or "slice:"');
    }
    const entries = {
      ...elements,
      ...Object.assign({}, ...slices),
    };
    for (const id of pathConfigItem.specs.staticElementIds || []) {
      if (skipIdSet.has(id)) {
        delete entries[id];
      }
    }
    if (!pathConfigItem.specs.rootElementIsStatic || !skipIdSet.has('root')) {
      entries.root = rootElement;
    }
    const decodedPathname = decodeURI(pathname);
    const routeId = ROUTE_SLOT_ID_PREFIX + decodedPathname;
    if (!pathConfigItem.specs.routeElementIsStatic || !skipIdSet.has(routeId)) {
      entries[routeId] = routeElement;
    }
    entries[ROUTE_ID] = [decodedPathname, query];
    entries[IS_STATIC_ID] = !!pathConfigItem.specs.isStatic;
    if (await has404()) {
      entries[HAS404_ID] = true;
    }
    return entries;
  };

  type HandleRequest = Parameters<typeof defineEntries>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineEntries>[0]['handleBuild'];
  type BuildConfig =
    NonNullable<ReturnType<HandleBuild>> extends AsyncIterable<infer T>
      ? T
      : never;

  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, renderHtml },
  ) => {
    if (input.type === 'component') {
      const sliceId = decodeSliceId(input.rscPath);
      if (sliceId !== null) {
        // LIMITATION: This is a signle slice request.
        // Ideally, we should be able to respond with multiple slices in one request.
        if (!fns.handleSlice) {
          return null;
        }
        const { element, isStatic } = await fns.handleSlice(sliceId);
        return renderRsc({
          [SLICE_SLOT_ID_PREFIX + sliceId]: element,
          // FIXME: hard-coded for now
          [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId]: !!isStatic,
        });
      }
      const entries = await getEntries(
        input.rscPath,
        input.rscParams,
        input.req.headers,
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
          getEntries(rscPath, rscParams, input.req.headers),
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
          const rscPath = encodeRoutePath(info.location);
          const entries = await getEntries(
            rscPath,
            undefined,
            input.req.headers,
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
    const pathConfigItem = await getPathConfigItem(input.pathname);
    if (pathConfigItem?.specs?.isApi && fns.handleApi) {
      return fns.handleApi(input.pathname, {
        url: input.req.url,
        body: input.req.body,
        headers: input.req.headers,
        method: input.req.method,
      });
    }
    if (input.type === 'action' || input.type === 'custom') {
      const renderIt = async (
        pathname: string,
        query: string,
        httpstatus = 200,
      ) => {
        const rscPath = encodeRoutePath(pathname);
        const rscParams = new URLSearchParams({ query });
        const entries = await getEntries(rscPath, rscParams, input.req.headers);
        if (!entries) {
          return null;
        }
        const html = createElement(INTERNAL_ServerRouter, {
          route: { path: pathname, query, hash: '' },
          httpstatus,
        });
        const actionResult =
          input.type === 'action' ? await input.fn() : undefined;
        return renderHtml(entries, html, { rscPath, actionResult });
      };
      const query = input.req.url.searchParams.toString();
      if (pathConfigItem?.specs?.noSsr) {
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
      if (await has404()) {
        return { ...(await renderIt('/404', '', 404)), status: 404 };
      } else {
        return null;
      }
    }
  };

  type Tasks = Array<() => Promise<BuildConfig>>;
  const handleBuild: HandleBuild = ({
    renderRsc,
    renderHtml,
    rscPath2pathname,
    unstable_generatePrefetchCode,
    unstable_collectClientModules,
  }) =>
    createAsyncIterable(async (): Promise<Tasks> => {
      const tasks: Tasks = [];
      const pathConfig = await getMyPathConfig();

      for (const { pathname, specs } of pathConfig) {
        const { handleApi } = fns;
        if (pathname && specs.isStatic && specs.isApi && handleApi) {
          tasks.push(async () => ({
            type: 'file',
            pathname,
            body: handleApi(pathname, {
              url: new URL(pathname, 'http://localhost:3000'),
              body: null,
              headers: {},
              method: 'GET',
            }).then(({ body }) => body || stringToStream('')),
          }));
        }
      }

      const path2moduleIds: Record<string, string[]> = {};
      const moduleIdsForPrefetch = new WeakMap<PathSpec, Set<string>>();
      // FIXME this approach keeps all entries in memory during the loop
      const entriesCache = new Map<string, Record<string, unknown>>();
      await Promise.all(
        pathConfig.map(async ({ pathSpec, pathname, pattern, specs }) => {
          if (specs.isApi) {
            return;
          }
          const moduleIds = new Set<string>();
          moduleIdsForPrefetch.set(pathSpec, moduleIds);
          if (!pathname) {
            return;
          }
          const rscPath = encodeRoutePath(pathname);
          const entries = await getEntries(rscPath, undefined, {});
          if (entries) {
            entriesCache.set(pathname, entries);
            path2moduleIds[pattern] =
              await unstable_collectClientModules(entries);
            if (specs.isStatic) {
              tasks.push(async () => ({
                type: 'file',
                pathname: rscPath2pathname(rscPath),
                body: renderRsc(entries, {
                  moduleIdCallback: (id) => moduleIds.add(id),
                }),
              }));
            }
          }
        }),
      );

      const getRouterPrefetchCode = () => `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path) => {
  const path2ids = ${JSON.stringify(path2moduleIds)};
  const pattern = Object.keys(path2ids).find((key) => new RegExp(key).test(path));
  if (pattern && path2ids[pattern]) {
    for (const id of path2ids[pattern] || []) {
      import(id);
    }
  }
};`;

      for (const { pathSpec, pathname, specs } of pathConfig) {
        if (specs.isApi) {
          continue;
        }
        tasks.push(async () => {
          if (specs.noSsr) {
            if (!pathname) {
              throw new Error('Pathname is required for noSsr routes on build');
            }
            return {
              type: 'defaultHtml',
              pathname,
            };
          }
          const moduleIds = moduleIdsForPrefetch.get(pathSpec)!;
          if (pathname) {
            const rscPath = encodeRoutePath(pathname);
            const code =
              unstable_generatePrefetchCode([rscPath], moduleIds) +
              getRouterPrefetchCode();
            const entries = entriesCache.get(pathname);
            if (specs.isStatic && entries) {
              const html = createElement(INTERNAL_ServerRouter, {
                route: { path: pathname, query: '', hash: '' },
                httpstatus: specs.is404 ? 404 : 200,
              });
              return {
                type: 'file',
                pathname,
                body: renderHtml(entries, html, {
                  rscPath,
                  htmlHead: `<script type="module" async>${code}</script>`,
                }).then(({ body }) => body),
              };
            }
          }
          const code =
            unstable_generatePrefetchCode([], moduleIds) +
            getRouterPrefetchCode();
          return {
            type: 'htmlHead',
            pathSpec,
            head: `<script type="module" async>${code}</script>`,
          };
        });
      }

      await unstable_setPlatformData(
        'defineRouterPathConfigs',
        pathConfig,
        true,
      );
      return tasks;
    });

  return defineEntries({ handleRequest, handleBuild });
}
