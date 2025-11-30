import type { ReactNode } from 'react';
import { createCustomError, getErrorInfo } from '../lib/utils/custom-errors.js';
import { getPathMapping, path2regexp } from '../lib/utils/path.js';
import type { PathSpec } from '../lib/utils/path.js';
import { base64ToStream, streamToBase64 } from '../lib/utils/stream.js';
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

const htmlPath2pathname = (htmlPath: string): string =>
  htmlPath === '/404' ? '404.html' : htmlPath + '/index.html';

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

const assertNonReservedSlotId = (slotId: SlotId) => {
  if (
    slotId === ROOT_SLOT_ID ||
    slotId.startsWith(ROUTE_SLOT_ID_PREFIX) ||
    slotId.startsWith(SLICE_SLOT_ID_PREFIX)
  ) {
    throw new Error('Element ID cannot be "root", "route:*" or "slice:*"');
  }
};

type RendererOption = { pathname: string; query: string | undefined };

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
  handler: (req: Request) => Promise<Response>;
};

type SliceConfig = {
  type: 'slice';
  id: string;
  isStatic: boolean;
  renderer: () => Promise<ReactNode>;
};

export function unstable_defineRouter(fns: {
  getConfigs: () => Promise<Iterable<RouteConfig | ApiConfig | SliceConfig>>;
}) {
  // This is an internal type for caching
  type MyConfig = {
    configs: (
      | (RouteConfig & {
          pathname: string | undefined;
          pattern: string;
          noSsr: boolean;
          slices: string[];
          is404: boolean;
        })
      | (ApiConfig & {
          pathname: string | undefined;
          pattern: string;
        })
      | SliceConfig
    )[];
    has404: boolean;
  };

  let cachedMyConfig: MyConfig | undefined;
  const getMyConfig = async (): Promise<MyConfig> => {
    if (!cachedMyConfig) {
      const configs = Array.from(await fns.getConfigs()).map((item) => {
        switch (item.type) {
          case 'route': {
            const is404 =
              item.path.length === 1 &&
              item.path[0]!.type === 'literal' &&
              item.path[0]!.name === '404';
            Object.keys(item.elements).forEach(assertNonReservedSlotId);
            return {
              ...item,
              pathname: pathSpec2pathname(item.path),
              pattern: path2regexp(item.pathPattern || item.path),
              noSsr: !!item.noSsr,
              slices: item.slices || [],
              is404,
            };
          }
          case 'api': {
            return {
              ...item,
              pathname: pathSpec2pathname(item.path),
              pattern: path2regexp(item.path),
            };
          }
          case 'slice': {
            return {
              ...item,
            };
          }
          default:
            throw new Error('Unknown config type');
        }
      });
      cachedMyConfig = {
        configs,
        has404: configs.some((item) => item.type === 'route' && item.is404),
      };
    }
    return cachedMyConfig;
  };

  const getPathConfigItem = async (pathname: string) => {
    const myConfig = await getMyConfig();
    const found = myConfig.configs.find(
      (item): item is typeof item & { type: 'route' | 'api' } =>
        (item.type === 'route' || item.type === 'api') &&
        !!getPathMapping(item.path, pathname),
    );
    return found;
  };

  const getSliceElement = async (
    sliceConfig: {
      id: string;
      isStatic: boolean;
      renderer: () => Promise<ReactNode>;
    },
    getCachedElement: (id: SlotId) => Promise<ReactNode> | undefined,
    setCachedElement: (id: SlotId, element: ReactNode) => Promise<ReactNode>,
  ): Promise<ReactNode> => {
    const id = SLICE_SLOT_ID_PREFIX + sliceConfig.id;
    const cached = getCachedElement(id);
    if (cached) {
      return cached;
    }
    let element = await sliceConfig.renderer();
    if (sliceConfig.isStatic) {
      element = await setCachedElement(id, element);
    }
    return element;
  };

  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    headers: Readonly<Record<string, string>>,
    getCachedElement: (id: SlotId) => Promise<ReactNode> | undefined,
    setCachedElement: (id: SlotId, element: ReactNode) => Promise<ReactNode>,
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const pathname = decodeRoutePath(rscPath);
    const pathConfigItem = await getPathConfigItem(pathname);
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
    const decodedPathname = decodeURI(pathname);
    const routeId = ROUTE_SLOT_ID_PREFIX + decodedPathname;
    const option: RendererOption = {
      pathname: decodedPathname,
      query: pathConfigItem.isStatic ? undefined : query,
    };
    const slices = pathConfigItem.slices;
    const myConfig = await getMyConfig();
    const sliceConfigMap = new Map<
      string,
      { id: string; isStatic: boolean; renderer: () => Promise<ReactNode> }
    >();
    slices.forEach((sliceId) => {
      const sliceConfig = myConfig.configs.find(
        (item): item is typeof item & { type: 'slice' } =>
          item.type === 'slice' && item.id === sliceId,
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
          const cached = getCachedElement(ROOT_SLOT_ID);
          entries[ROOT_SLOT_ID] = cached
            ? await cached
            : await setCachedElement(
                ROOT_SLOT_ID,
                pathConfigItem.rootElement.renderer(option),
              );
        }
      })(),
      (async () => {
        if (!pathConfigItem.routeElement.isStatic) {
          entries[routeId] = pathConfigItem.routeElement.renderer(option);
        } else if (!skipIdSet.has(routeId)) {
          const cached = getCachedElement(routeId);
          entries[routeId] = cached
            ? await cached
            : await setCachedElement(
                routeId,
                pathConfigItem.routeElement.renderer(option),
              );
        }
      })(),
      ...Object.entries(pathConfigItem.elements).map(async ([id, isStatic]) => {
        const renderer = pathConfigItem.elements[id]?.renderer;
        if (!isStatic) {
          entries[id] = renderer?.(option);
        } else if (!skipIdSet.has(id)) {
          const cached = getCachedElement(id);
          entries[id] = cached
            ? await cached
            : await setCachedElement(id, renderer?.(option));
        }
      }),
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
    entries[ROUTE_ID] = [decodedPathname, query];
    entries[IS_STATIC_ID] = pathConfigItem.isStatic;
    sliceConfigMap.forEach((sliceConfig, sliceId) => {
      if (sliceConfig.isStatic) {
        // FIXME: hard-coded for now
        entries[IS_STATIC_ID + ':' + SLICE_SLOT_ID_PREFIX + sliceId] = true;
      }
    });
    if (myConfig.has404) {
      entries[HAS404_ID] = true;
    }
    return entries;
  };

  type HandleRequest = Parameters<typeof defineHandlers>[0]['handleRequest'];
  type HandleBuild = Parameters<typeof defineHandlers>[0]['handleBuild'];

  const cachedElementsForRequest = new Map<SlotId, Promise<ReactNode>>();
  let cachedElementsForRequestInitialized = false;
  const handleRequest: HandleRequest = async (
    input,
    { renderRsc, parseRsc, renderHtml, loadBuildMetadata },
  ): Promise<ReadableStream | Response | 'fallback' | null | undefined> => {
    const getCachedElement = (id: SlotId) => cachedElementsForRequest.get(id);
    const setCachedElement = (id: SlotId, element: ReactNode) => {
      const cached = cachedElementsForRequest.get(id);
      if (cached) {
        return cached;
      }
      const copied = renderRsc({ [id]: element }).then((rscStream) =>
        parseRsc(rscStream).then((parsed) => parsed[id]),
      ) as Promise<ReactNode>;
      cachedElementsForRequest.set(id, copied);
      return copied;
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
              parseRsc(base64ToStream(str as string)).then(
                (parsed) => parsed[id],
              ) as Promise<ReactNode>,
            );
          },
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
          myConfig.configs.find(
            (item): item is typeof item & { type: 'slice' } =>
              item.type === 'slice' && item.id === sliceId,
          ),
        );
        if (!sliceConfig) {
          return null;
        }
        const sliceElement = await getSliceElement(
          sliceConfig,
          getCachedElement,
          setCachedElement,
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
          const rscPath = encodeRoutePath(info.location);
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
    const pathConfigItem = await getPathConfigItem(input.pathname);
    if (pathConfigItem?.type === 'api') {
      const url = new URL(input.req.url);
      url.pathname = input.pathname;
      const req = new Request(url, input.req);
      return pathConfigItem.handler(req);
    }
    if (input.type === 'action' || input.type === 'custom') {
      const renderIt = async (
        pathname: string,
        query: string,
        httpstatus = 200,
      ) => {
        const rscPath = encodeRoutePath(pathname);
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
      if ((await getMyConfig()).has404) {
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
    const myConfig = await getMyConfig();
    const cachedElementsForBuild = new Map<SlotId, Promise<ReactNode>>();
    const serializedCachedElements = new Map<SlotId, string>();
    const getCachedElement = (id: SlotId) => cachedElementsForBuild.get(id);
    const setCachedElement = async (id: SlotId, element: ReactNode) => {
      const cached = cachedElementsForBuild.get(id);
      if (cached) {
        return cached;
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
      serializedCachedElements.set(id, await streamToBase64(await stream2));
      return copied;
    };

    // hard-coded concurrency limit
    const { runTask, waitForTasks } = createTaskRunner(500);

    // static api
    for (const item of myConfig.configs) {
      if (item.type !== 'api') {
        continue;
      }
      if (!item.isStatic) {
        continue;
      }
      const pathname = item.pathname;
      if (!pathname) {
        continue;
      }
      const req = new Request(new URL(pathname, 'http://localhost:3000'));
      runTask(async () => {
        await withRequest(req, async () => {
          const res = await item.handler(req);
          await generateFile(pathname, res.body || '');
        });
      });
    }

    // static route
    for (const item of myConfig.configs) {
      if (item.type !== 'route') {
        continue;
      }
      if (!item.isStatic) {
        continue;
      }
      const pathname = item.pathname;
      if (!pathname) {
        continue;
      }
      const rscPath = encodeRoutePath(pathname);
      const req = new Request(new URL(pathname, 'http://localhost:3000'));
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
          for (const id of Object.keys(entries)) {
            const cached = getCachedElement(id);
            entries[id] = cached ? await cached : entries[id];
          }
          const stream = await renderRsc(entries);
          const [stream1, stream2] = stream.tee();
          await generateFile(rscPath2pathname(rscPath), stream1);
          const html = (
            <INTERNAL_ServerRouter
              route={{ path: pathname, query: '', hash: '' }}
              httpstatus={item.is404 ? 404 : 200}
            />
          );
          const res = await renderHtml(stream2, html, { rscPath });
          await generateFile(htmlPath2pathname(pathname), res.body || '');
        });
      });
    }

    // default html
    for (const item of myConfig.configs) {
      if (item.type !== 'route') {
        continue;
      }
      const { pathname, noSsr } = item;
      if (noSsr) {
        if (!pathname) {
          throw new Error('Pathname is required for noSsr routes on build');
        }
        runTask(async () => {
          await generateDefaultHtml(htmlPath2pathname(pathname));
        });
      }
    }

    // static slice
    for (const item of myConfig.configs) {
      if (item.type !== 'slice') {
        continue;
      }
      if (!item.isStatic) {
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
  };

  return defineHandlers({ handleRequest, handleBuild });
}
