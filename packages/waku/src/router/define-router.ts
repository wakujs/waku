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
  encodeSliceId,
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

const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

export function unstable_defineRouter(fns: {
  getConfig: () => Promise<
    Iterable<
      | {
          type: 'route';
          path: PathSpec;
          isStatic: boolean;
          pathPattern?: PathSpec;
          rootElement: { isStatic?: boolean };
          routeElement: { isStatic?: boolean };
          elements: Record<SlotId, { isStatic?: boolean }>;
          noSsr?: boolean;
        }
      | {
          type: 'api';
          path: PathSpec;
          isStatic: boolean;
        }
      | {
          type: 'slice';
          id: string;
          isStatic: boolean;
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
    slices?: string[];
  }>;
  handleApi?: (req: Request) => Promise<Response>;
  handleSlice?: (sliceId: string) => Promise<{
    element: ReactNode;
  }>;
}) {
  type MyConfig = (
    | {
        type: 'route';
        pathSpec: PathSpec;
        pathname: string | undefined;
        pattern: string;
        specs: {
          rootElementIsStatic: boolean;
          routeElementIsStatic: boolean;
          staticElementIds: SlotId[];
          isStatic: boolean;
          noSsr: boolean;
          is404: boolean;
        };
      }
    | {
        type: 'api';
        pathSpec: PathSpec;
        pathname: string | undefined;
        pattern: string;
        specs: {
          isStatic: boolean;
        };
      }
    | {
        type: 'slice';
        id: string;
        specs: {
          isStatic: boolean;
        };
      }
  )[];
  let cachedMyConfig: MyConfig | undefined;
  const getMyConfig = async (): Promise<MyConfig> => {
    const myConfig = await unstable_getPlatformData('defineRouterMyConfig');
    if (myConfig) {
      return myConfig as MyConfig;
    }
    if (!cachedMyConfig) {
      cachedMyConfig = Array.from(await fns.getConfig()).map((item) => {
        switch (item.type) {
          case 'route': {
            const is404 =
              item.path.length === 1 &&
              item.path[0]!.type === 'literal' &&
              item.path[0]!.name === '404';
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
            return {
              type: 'route',
              pathSpec: item.path,
              pathname: pathSpec2pathname(item.path),
              pattern: path2regexp(item.pathPattern || item.path),
              specs: {
                rootElementIsStatic: !!item.rootElement.isStatic,
                routeElementIsStatic: !!item.routeElement.isStatic,
                staticElementIds: Object.entries(item.elements).flatMap(
                  ([id, { isStatic }]) => (isStatic ? [id] : []),
                ),
                isStatic: item.isStatic,
                noSsr: !!item.noSsr,
                is404,
              },
            };
          }
          case 'api': {
            return {
              type: 'api',
              pathSpec: item.path,
              pathname: pathSpec2pathname(item.path),
              pattern: path2regexp(item.path),
              specs: {
                isStatic: item.isStatic,
              },
            };
          }
          case 'slice': {
            return {
              type: 'slice',
              id: item.id,
              specs: {
                isStatic: item.isStatic,
              },
            };
          }
          default:
            throw new Error('Unknown config type');
        }
      });
    }
    return cachedMyConfig;
  };
  const getPathConfigItem = async (pathname: string) => {
    const myConfig = await getMyConfig();
    const found = myConfig.find(
      (item): item is typeof item & { type: 'route' | 'api' } =>
        (item.type === 'route' || item.type === 'api') &&
        !!getPathMapping(item.pathSpec, pathname),
    );
    return found;
  };
  const has404 = async () => {
    const myConfig = await getMyConfig();
    return myConfig.some(({ type, specs }) => type === 'route' && specs.is404);
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
    const {
      rootElement,
      routeElement,
      elements,
      slices = [],
    } = await fns.handleRoute(
      pathname,
      pathConfigItem.specs.isStatic ? {} : { query },
    );
    if (
      Object.keys(elements).some(
        (id) =>
          id.startsWith(ROUTE_SLOT_ID_PREFIX) ||
          id.startsWith(SLICE_SLOT_ID_PREFIX),
      )
    ) {
      throw new Error('Element ID cannot start with "route:" or "slice:"');
    }
    const sliceConfigMap = new Map<string, { isStatic?: boolean }>();
    await Promise.all(
      slices.map(async (sliceId) => {
        const myConfig = await getMyConfig();
        const sliceConfig = myConfig.find(
          (item) => item.type === 'slice' && item.id === sliceId,
        )?.specs;
        if (sliceConfig) {
          sliceConfigMap.set(sliceId, sliceConfig);
        }
      }),
    );
    const sliceElementEntries = (
      await Promise.all(
        slices.map(async (sliceId) => {
          const id = SLICE_SLOT_ID_PREFIX + sliceId;
          const { isStatic } = sliceConfigMap.get(sliceId) || {};
          if (isStatic && skipIdSet.has(id)) {
            return null;
          }
          if (!fns.handleSlice) {
            return null;
          }
          const { element } = await fns.handleSlice(sliceId);
          return [id, element];
        }),
      )
    ).filter((ent): ent is NonNullable<typeof ent> => !!ent);
    const entries = {
      ...elements,
      ...Object.fromEntries(sliceElementEntries),
    };
    const decodedPathname = decodeURI(pathname);
    const routeId = ROUTE_SLOT_ID_PREFIX + decodedPathname;
    if (pathConfigItem.type === 'route') {
      for (const id of pathConfigItem.specs.staticElementIds || []) {
        if (skipIdSet.has(id)) {
          delete entries[id];
        }
      }
      if (!pathConfigItem.specs.rootElementIsStatic || !skipIdSet.has('root')) {
        entries.root = rootElement;
      }
      if (
        !pathConfigItem.specs.routeElementIsStatic ||
        !skipIdSet.has(routeId)
      ) {
        entries[routeId] = routeElement;
      }
    }
    entries[ROUTE_ID] = [decodedPathname, query];
    entries[IS_STATIC_ID] = pathConfigItem.specs.isStatic;
    sliceConfigMap.forEach(({ isStatic }, sliceId) => {
      if (isStatic) {
        // FIXME: hard-coded for now
        entries[IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId] = true;
      }
    });
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
  ): Promise<ReadableStream | Response | 'fallback' | null | undefined> => {
    const url = new URL(input.req.url);
    const headers = Object.fromEntries(input.req.headers.entries());
    if (input.type === 'component') {
      const sliceId = decodeSliceId(input.rscPath);
      if (sliceId !== null) {
        // LIMITATION: This is a signle slice request.
        // Ideally, we should be able to respond with multiple slices in one request.
        if (!fns.handleSlice) {
          return null;
        }
        const [sliceConfig, { element }] = await Promise.all([
          getMyConfig().then((myConfig) =>
            myConfig.find(
              (item): item is typeof item & { type: 'slice' } =>
                item.type === 'slice' && item.id === sliceId,
            ),
          ),
          fns.handleSlice(sliceId),
        ]);
        return renderRsc({
          [SLICE_SLOT_ID_PREFIX + sliceId]: element,
          ...(sliceConfig?.specs.isStatic
            ? {
                // FIXME: hard-coded for now
                [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId]: true,
              }
            : {}),
        });
      }
      const entries = await getEntries(input.rscPath, input.rscParams, headers);
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
          getEntries(rscPath, rscParams, headers),
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
          const entries = await getEntries(rscPath, undefined, headers);
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
    if (pathConfigItem?.type === 'api' && fns.handleApi) {
      return fns.handleApi(input.req);
    }
    if (input.type === 'action' || input.type === 'custom') {
      const renderIt = async (
        pathname: string,
        query: string,
        httpstatus = 200,
      ) => {
        const rscPath = encodeRoutePath(pathname);
        const rscParams = new URLSearchParams({ query });
        const entries = await getEntries(rscPath, rscParams, headers);
        if (!entries) {
          return null;
        }
        const html = createElement(INTERNAL_ServerRouter, {
          route: { path: pathname, query, hash: '' },
          httpstatus,
        });
        const actionResult =
          input.type === 'action' ? await input.fn() : undefined;
        return renderHtml(entries, html, {
          rscPath,
          actionResult,
          status: httpstatus,
        });
      };
      const query = url.searchParams.toString();
      if (pathConfigItem?.type === 'route' && pathConfigItem.specs.noSsr) {
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
        return renderIt('/404', '', 404);
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
  }) =>
    createAsyncIterable(async (): Promise<Tasks> => {
      const tasks: Tasks = [];
      const myConfig = await getMyConfig();

      for (const item of myConfig) {
        const { handleApi } = fns;
        if (
          item.type === 'api' &&
          item.pathname &&
          item.specs.isStatic &&
          handleApi
        ) {
          const pathname = item.pathname;
          tasks.push(async () => ({
            type: 'file',
            pathname,
            body: handleApi(
              new Request(new URL(pathname, 'http://localhost:3000')),
            ).then((res) => res.body || stringToStream('')),
          }));
        }
      }

      // FIXME this approach keeps all entries in memory during the loop
      const entriesCache = new Map<string, Record<string, unknown>>();
      await Promise.all(
        myConfig.map(async (item) => {
          if (item.type !== 'route') {
            return;
          }
          if (!item.pathname) {
            return;
          }
          const rscPath = encodeRoutePath(item.pathname);
          const entries = await getEntries(rscPath, undefined, {});
          if (entries) {
            entriesCache.set(item.pathname, entries);
            if (item.specs.isStatic) {
              tasks.push(async () => ({
                type: 'file',
                pathname: rscPath2pathname(rscPath),
                body: renderRsc(entries),
              }));
            }
          }
        }),
      );

      for (const item of myConfig) {
        if (item.type !== 'route') {
          continue;
        }
        const { pathname, specs } = item;
        if (specs.noSsr) {
          if (!pathname) {
            throw new Error('Pathname is required for noSsr routes on build');
          }
          tasks.push(async () => ({
            type: 'defaultHtml',
            pathname,
          }));
        } else if (pathname) {
          const entries = entriesCache.get(pathname);
          if (specs.isStatic && entries) {
            const rscPath = encodeRoutePath(pathname);
            const html = createElement(INTERNAL_ServerRouter, {
              route: { path: pathname, query: '', hash: '' },
              httpstatus: specs.is404 ? 404 : 200,
            });
            tasks.push(async () => ({
              type: 'file',
              pathname,
              body: renderHtml(entries, html, {
                rscPath,
              }).then((res) => res.body || ''),
            }));
          }
        }
      }

      await Promise.all(
        myConfig.map(async (item) => {
          if (item.type !== 'slice') {
            return;
          }
          if (!item.specs.isStatic) {
            return;
          }
          if (!fns.handleSlice) {
            return;
          }
          const { element } = await fns.handleSlice(item.id);
          const body = renderRsc({
            [SLICE_SLOT_ID_PREFIX + item.id]: element,
            ...(item.specs.isStatic
              ? {
                  // FIXME: hard-coded for now
                  [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + item.id]: true,
                }
              : {}),
          });
          const rscPath = encodeSliceId(item.id);
          tasks.push(async () => ({
            type: 'file',
            pathname: rscPath2pathname(rscPath),
            body,
          }));
        }),
      );

      await unstable_setPlatformData('defineRouterMyConfig', myConfig, true);
      return tasks;
    });

  return defineEntries({ handleRequest, handleBuild });
}
