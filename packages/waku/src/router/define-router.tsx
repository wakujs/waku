import type { ReactElement, ReactNode } from 'react';
import { createCustomError, getErrorInfo } from '../lib/utils/custom-errors.js';
import { getPathMapping, path2regexp } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import {
  base64ToStream,
  streamToBase64,
  stringToStream,
} from '../lib/utils/stream.js';
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
} from './common.js';

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

const ROOT_SLOT_ID = 'root';
const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

const assertValidElementId = (slotId: SlotId) => {
  if (
    slotId === ROOT_SLOT_ID ||
    slotId.startsWith(ROUTE_SLOT_ID_PREFIX) ||
    slotId.startsWith(SLICE_SLOT_ID_PREFIX)
  ) {
    throw new Error('Element ID cannot be "root", "route:*" or "slice:*"');
  }
};

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
      getCachedElement: (
        id: 'root' | 'route' | SlotId,
      ) => Promise<NonNullable<ReactNode> | undefined>;
      query: string | undefined;
    },
  ) => Promise<{
    rootElement: ReactElement;
    routeElement: ReactElement;
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
    if (!cachedMyConfig) {
      cachedMyConfig = Array.from(await fns.getConfig()).map((item) => {
        switch (item.type) {
          case 'route': {
            const is404 =
              item.path.length === 1 &&
              item.path[0]!.type === 'literal' &&
              item.path[0]!.name === '404';
            Object.keys(item.elements).forEach(assertValidElementId);
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
  const getSlice = async (
    sliceId: string,
    isStatic: boolean,
    getCachedElement: (
      id: SlotId,
    ) => Promise<NonNullable<ReactNode> | undefined>,
    setCachedElement: (
      id: SlotId,
      element: NonNullable<ReactNode>,
    ) => Promise<void>,
  ): Promise<{
    element: ReactNode;
  } | null> => {
    const id = SLICE_SLOT_ID_PREFIX + sliceId;
    if (!fns.handleSlice) {
      return null;
    }
    const cachedSlice = await getCachedElement(id);
    if (cachedSlice) {
      return { element: cachedSlice as ReactNode };
    }
    let { element } = await fns.handleSlice(sliceId);
    if (isStatic && element) {
      await setCachedElement(id, element);
      element = await getCachedElement(id)!;
    }
    return { element };
  };
  const getEntries = async (
    rscPath: string,
    rscParams: unknown,
    headers: Readonly<Record<string, string>>,
    getCachedElement: (
      id: SlotId,
    ) => Promise<NonNullable<ReactNode> | undefined>,
    setCachedElement: (
      id: SlotId,
      element: NonNullable<ReactNode>,
    ) => Promise<void>,
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
    const decodedPathname = decodeURI(pathname);
    const routeId = ROUTE_SLOT_ID_PREFIX + decodedPathname;
    const {
      elements,
      slices = [],
      ...rest
    } = await fns.handleRoute(pathname, {
      getCachedElement: async (
        id,
      ): Promise<NonNullable<ReactNode> | undefined> => {
        if (id === 'root') {
          return getCachedElement(ROOT_SLOT_ID);
        }
        if (id === 'route') {
          return getCachedElement(routeId);
        }
        assertValidElementId(id);
        return getCachedElement(id);
      },
      query: pathConfigItem.specs.isStatic ? undefined : query,
    });
    let { rootElement, routeElement } = rest;
    Object.keys(elements).forEach(assertValidElementId);
    if (pathConfigItem.type === 'route') {
      if (pathConfigItem.specs.rootElementIsStatic) {
        await setCachedElement(ROOT_SLOT_ID, rootElement);
        rootElement = (await getCachedElement(ROOT_SLOT_ID)) as ReactElement;
      }
      if (pathConfigItem.specs.routeElementIsStatic) {
        await setCachedElement(routeId, routeElement);
        routeElement = (await getCachedElement(routeId)) as ReactElement;
      }
      await Promise.all(
        Object.entries(elements).map(async ([id, element]) => {
          if (pathConfigItem.specs.staticElementIds.includes(id) && element) {
            await setCachedElement(id, element as NonNullable<ReactNode>);
            elements[id] = await getCachedElement(id)!;
          }
        }),
      );
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
          const slice = await getSlice(
            sliceId,
            !!isStatic,
            getCachedElement,
            setCachedElement,
          );
          if (!slice) {
            return null;
          }
          return [id, slice.element];
        }),
      )
    ).filter((ent): ent is NonNullable<typeof ent> => !!ent);
    const entries: Record<SlotId, unknown> = {
      ...elements,
      ...Object.fromEntries(sliceElementEntries),
    };
    if (pathConfigItem.type === 'route') {
      for (const id of pathConfigItem.specs.staticElementIds || []) {
        if (skipIdSet.has(id)) {
          delete entries[id];
        }
      }
      if (
        !pathConfigItem.specs.rootElementIsStatic ||
        !skipIdSet.has(ROOT_SLOT_ID)
      ) {
        entries[ROOT_SLOT_ID] = rootElement;
      }
      if (
        !pathConfigItem.specs.routeElementIsStatic ||
        !skipIdSet.has(routeId)
      ) {
        entries[routeId] = routeElement;
      }
    }
    entries[ROUTE_ID] = [decodedPathname, query];
    entries[IS_STATIC_ID] = !!pathConfigItem.specs.isStatic;
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

  type HandleRequest = Parameters<typeof defineHandlers>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

  const cachedElementsForRequest = new Map<SlotId, NonNullable<ReactNode>>();
  let cachedElementsForRequestInitialized = false;
  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, parseRsc, renderHtml, loadBuildMetadata },
  ): Promise<ReadableStream | Response | 'fallback' | null | undefined> => {
    const getCachedElement = async (
      id: SlotId,
    ): Promise<NonNullable<ReactNode> | undefined> =>
      cachedElementsForRequest.get(id);
    const setCachedElement = async (
      id: SlotId,
      element: NonNullable<ReactNode>,
    ) => {
      if (!cachedElementsForRequest.has(id)) {
        const rscStream = await renderRsc({ [id]: element });
        const copied = (await parseRsc(rscStream))[id];
        cachedElementsForRequest.set(id, copied as NonNullable<ReactNode>);
      }
    };
    if (!cachedElementsForRequestInitialized) {
      cachedElementsForRequestInitialized = true;
      const cachedElementsMetadata = await loadBuildMetadata(
        'defineRouter:cachedElements',
      );
      if (cachedElementsMetadata) {
        await Promise.all(
          Object.entries(JSON.parse(cachedElementsMetadata)).map(
            async ([id, str]) => {
              const element = (await parseRsc(base64ToStream(str as string)))[
                id
              ];
              cachedElementsForRequest.set(
                id,
                element as NonNullable<ReactNode>,
              );
            },
          ),
        );
      }
    }
    const url = new URL(input.req.url);
    const headers = Object.fromEntries(input.req.headers.entries());
    if (input.type === 'component') {
      const sliceId = decodeSliceId(input.rscPath);
      if (sliceId !== null) {
        // LIMITATION: This is a signle slice request.
        // Ideally, we should be able to respond with multiple slices in one request.
        const sliceConfig = await getMyConfig().then((myConfig) =>
          myConfig.find(
            (item): item is typeof item & { type: 'slice' } =>
              item.type === 'slice' && item.id === sliceId,
          ),
        );
        const isStatic = !!sliceConfig?.specs.isStatic;
        const slice = await getSlice(
          sliceId,
          isStatic,
          getCachedElement,
          setCachedElement,
        );
        if (!slice) {
          return null;
        }
        return renderRsc({
          [SLICE_SLOT_ID_PREFIX + sliceId]: slice.element,
          ...(isStatic
            ? {
                // FIXME: hard-coded for now
                [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId]: true,
              }
            : {}),
        });
      }
      const entries = await getEntries(
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
          getEntries(
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
          const rscPath = encodeRoutePath(info.location);
          const entries = await getEntries(
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
        const entries = await getEntries(
          rscPath,
          rscParams,
          headers,
          getCachedElement,
          setCachedElement,
        );
        if (!entries) {
          return null;
        }
        const html = (
          <INTERNAL_ServerRouter
            route={{ path: pathname, query, hash: '' }}
            httpstatus={httpstatus}
          />
        );
        const actionResult =
          input.type === 'action' ? await input.fn() : undefined;
        return renderHtml(await renderRsc(entries), html, {
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

  const handleBuild: HandleBuild = async ({
    renderRsc,
    parseRsc,
    renderHtml,
    rscPath2pathname,
    saveBuildMetadata,
    generateFile,
    generateDefaultHtml,
  }) => {
    const myConfig = await getMyConfig();
    const cachedElementsForBuild = new Map<SlotId, NonNullable<ReactNode>>();
    const serializedCachedElements = new Map<SlotId, string>();
    const getCachedElement = async (
      id: SlotId,
    ): Promise<NonNullable<ReactNode> | undefined> =>
      cachedElementsForBuild.get(id);
    const setCachedElement = async (
      id: SlotId,
      element: NonNullable<ReactNode>,
    ) => {
      if (!cachedElementsForBuild.has(id)) {
        const rscStream = await renderRsc({ [id]: element });
        const [stream1, stream2] = rscStream.tee();
        serializedCachedElements.set(id, await streamToBase64(stream1));
        const copied = (await parseRsc(stream2))[id];
        cachedElementsForBuild.set(id, copied as NonNullable<ReactNode>);
      }
    };

    for (const item of myConfig) {
      const { handleApi } = fns;
      if (
        item.type === 'api' &&
        item.pathname &&
        item.specs.isStatic &&
        handleApi
      ) {
        const pathname = item.pathname;
        const req = new Request(new URL(pathname, 'http://localhost:3000'));
        await generateFile(pathname, req, () =>
          handleApi(req).then((res) => res.body || stringToStream('')),
        );
      }
    }

    await Promise.all(
      myConfig.map(async (item) => {
        if (item.type !== 'route') {
          return;
        }
        const pathname = item.pathname;
        if (!pathname) {
          return;
        }
        const req = new Request(new URL(pathname, 'http://localhost:3000'));
        const rscPath = encodeRoutePath(pathname);
        const entries = await getEntries(
          rscPath,
          undefined,
          {},
          getCachedElement,
          setCachedElement,
        );
        if (entries) {
          for (const id of Object.keys(entries)) {
            entries[id] = (await getCachedElement(id)) ?? entries[id];
          }
          if (item.specs.isStatic) {
            // enforce RSC -> HTML generation sequential
            const entriesStreamPromise = (() => {
              let resolve, reject;
              const promise = new Promise<ReadableStream>((res, rej) => {
                resolve = res;
                reject = rej;
              });
              return { promise, resolve: resolve!, reject: reject! };
            })();
            await generateFile(rscPath2pathname(rscPath), req, async () => {
              const stream = await renderRsc(entries);
              const [stream1, stream2] = stream.tee();
              entriesStreamPromise.resolve(stream2);
              return stream1;
            });
            const html = (
              <INTERNAL_ServerRouter
                route={{ path: pathname, query: '', hash: '' }}
                httpstatus={item.specs.is404 ? 404 : 200}
              />
            );
            const entriesStream = await entriesStreamPromise.promise;
            await generateFile(pathname, req, () =>
              renderHtml(entriesStream, html, {
                rscPath,
              }).then((res) => res.body || ''),
            );
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
        await generateDefaultHtml(pathname);
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
        const slice = await getSlice(
          item.id,
          true,
          getCachedElement,
          setCachedElement,
        );
        if (!slice) {
          return;
        }
        const rscPath = encodeSliceId(item.id);
        // dummy req for slice which is not determined at build time
        const req = new Request(new URL('http://localhost:3000'));
        slice.element =
          (await getCachedElement(SLICE_SLOT_ID_PREFIX + item.id)) ??
          slice.element;
        await generateFile(rscPath2pathname(rscPath), req, () =>
          renderRsc({
            [SLICE_SLOT_ID_PREFIX + item.id]: slice.element,
            // FIXME: hard-coded for now
            [IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + item.id]: true,
          }),
        );
      }),
    );

    await saveBuildMetadata(
      'defineRouter:cachedElements',
      JSON.stringify(Object.fromEntries(serializedCachedElements)),
    );
  };

  return defineHandlers({ handleRequest, handleBuild });
}
