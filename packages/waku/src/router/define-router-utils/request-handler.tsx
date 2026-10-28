import {
  unstable_cancelRenderStream as cancelRenderStream,
  unstable_hasRenderCancellationDigest as hasRenderCancellationDigest,
  unstable_isRenderCancellation as isRenderCancellation,
} from 'waku/minimal/server';
import type {
  Unstable_HandleRequest as HandleRequest,
  Unstable_RenderRsc as RenderRsc,
} from 'waku/minimal/server';
import { INTERNAL_ServerRouter } from '../client.js';
import { pathnameToRoutePath } from '../isomorphic-utils/route-path.js';
import {
  ACTION_LOCATION_HEADER,
  INTENT_ID,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  decodeRoutePath,
  decodeSliceId,
  encodeRoutePath,
  getRouteSlotId,
  getSliceSlotId,
} from '../isomorphic-utils/router-protocol.js';
import { ROUTER_METADATA } from './build-metadata.js';
import { getRouterPrefetchCode } from './client-code.js';
import { createElementCache } from './element-cache.js';
import { getNonce, getRouteIntent, setRerender } from './request-store.js';
import type {
  Resolve,
  RouterDefinition,
  createRouteEntries,
} from './route-entries.js';
import { getQuery } from './route-entries.js';

type RouteEntries = {
  elements: Record<string, unknown>;
  etags: Record<string, string | 1>;
};

type HandlerInput = Parameters<HandleRequest>[0];

const createNotFoundResponse = () =>
  new Response(
    '<!doctype html><html><head><title>Not Found</title></head><body><h1>Not Found</h1></body></html>',
    {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-store',
      },
    },
  );

const parseInternalRoute = (location: string, base: string) => {
  if (!location.startsWith('/') || location.includes('#')) {
    return undefined;
  }
  const url = new URL(location, base);
  if (url.origin !== new URL(base).origin) {
    return undefined;
  }
  return {
    path: pathnameToRoutePath(url.pathname),
    query: url.searchParams.toString(),
  };
};

const parseServerFunctionOrigin = (req: Request) => {
  const location = req.headers.get(ACTION_LOCATION_HEADER);
  if (!location) {
    return undefined;
  }
  try {
    const route = parseInternalRoute(location, req.url);
    return route
      ? ([
          encodeRoutePath(route.path),
          new URLSearchParams({ query: route.query }),
        ] as const)
      : undefined;
  } catch {
    return undefined;
  }
};

export function createRequestHandler({
  resolve,
  routeEntries,
  runHandled,
}: {
  resolve: Resolve;
  routeEntries: ReturnType<typeof createRouteEntries>;
  runHandled: <T>(req: Request, fn: () => Promise<T>) => Promise<T>;
}): HandleRequest {
  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedModuleIdsByPrefetchRegExp: Record<string, string[]> | undefined;

  return async (
    input,
    { renderRsc, renderHtml, renderHtmlFallback, loadBuildMetadata },
  ) => {
    const renderIntentRsc = async (): ReturnType<HandleRequest> => {
      const intent = getRouteIntent();
      if (input.type === 'rsc' && decodeSliceId(input.rscPath) === null) {
        const pathname = decodeRoutePath(input.rscPath);
        const slotId = getRouteSlotId(pathname);
        return renderRsc(
          {
            ...(await routeEntries.getRouteMetadata(
              pathname,
              getQuery(input.rscParams),
            )),
            [IS_STATIC_ID]: false,
            [slotId]: null,
            [INTENT_ID]: intent.promise,
          },
          { etags: { [slotId]: '' } },
        );
      }
      return renderRsc({ [INTENT_ID]: intent.promise });
    };
    const handleRequest = async (): ReturnType<HandleRequest> => {
      const intent = getRouteIntent();
      const canHandleRenderCancellation = (error: unknown) =>
        intent.value !== undefined &&
        (isRenderCancellation(error) || hasRenderCancellationDigest(error));
      const renderRscWithIntent: RenderRsc = (elements, options) =>
        renderRsc(
          {
            ...elements,
            ...(intent.value && ROUTE_ID in elements
              ? { [IS_STATIC_ID]: false }
              : {}),
            [INTENT_ID]: intent.promise,
          },
          options,
        );
      requestElementCacheInit ??= (async () => {
        const cachedElementsMetadata = await loadBuildMetadata(
          ROUTER_METADATA.cachedElements,
        );
        if (cachedElementsMetadata) {
          const cachedElements = JSON.parse(cachedElementsMetadata) as Record<
            string,
            string
          >;
          for (const [cacheId, entry] of Object.entries(cachedElements)) {
            requestElementCache.preload(cacheId, entry);
          }
        }
      })();
      await requestElementCacheInit;
      const getModuleIdsByPrefetchRegExp = async () => {
        if (!cachedModuleIdsByPrefetchRegExp) {
          cachedModuleIdsByPrefetchRegExp = JSON.parse(
            (await loadBuildMetadata(
              ROUTER_METADATA.moduleIdsByPrefetchRegExp,
            )) || '{}',
          );
        }
        return cachedModuleIdsByPrefetchRegExp!;
      };

      // html has to carry every slot, so a client etag must not omit one
      const clientEtags = (input.type !== 'http' && input.etags) || {};
      const withRerender = async <T,>(
        fn: () => Promise<T>,
        getOrigin: () =>
          readonly [rscPath: string, rscParams: unknown] | undefined,
      ) => {
        const rerenders: { rscPath: string; rscParams: unknown }[] = [];
        let isOrigin = false;
        setRerender((rscPath, rscParams) => {
          if (rscPath === undefined) {
            const origin = getOrigin();
            if (!origin) {
              throw new Error(
                'The route this server function was called from is unknown',
              );
            }
            [rscPath, rscParams] = origin;
            isOrigin = true;
          } else {
            isOrigin = false;
          }
          rerenders.push({ rscPath, rscParams });
        });
        let value: T;
        try {
          value = await fn();
        } finally {
          setRerender(undefined);
        }
        const entries: RouteEntries = { elements: {}, etags: {} };
        if (!intent.value) {
          for (const result of await Promise.all(
            rerenders.map(({ rscPath, rscParams }) =>
              routeEntries.getEntriesForRoute(
                rscPath,
                rscParams,
                clientEtags,
                requestElementCache,
              ),
            ),
          )) {
            if (!result) {
              console.warn('getEntries returned null');
              continue;
            }
            Object.assign(entries.elements, result.elements);
            Object.assign(entries.etags, result.etags);
          }
        }
        return { value, entries, isOrigin };
      };

      const handleRscRequest = async ({
        rscPath,
        rscParams,
      }: Extract<HandlerInput, { type: 'rsc' }>) => {
        const sliceId = decodeSliceId(rscPath);
        if (sliceId !== null) {
          const entries = await routeEntries.getEntriesForElement(
            getSliceSlotId(sliceId),
            requestElementCache,
          );
          if (!entries) {
            return intent.value ? renderIntentRsc() : null;
          }
          return renderRscWithIntent(entries.elements, {
            etags: entries.etags,
          });
        }
        let entries = await routeEntries.getEntriesForRoute(
          rscPath,
          rscParams,
          clientEtags,
          requestElementCache,
        );
        if (!entries && (await routeEntries.has404())) {
          entries = await routeEntries.getEntriesForRoute(
            encodeRoutePath('/404'),
            rscParams,
            clientEtags,
            requestElementCache,
          );
        }
        if (!entries) {
          return intent.value ? renderIntentRsc() : null;
        }
        return renderRscWithIntent(entries.elements, {
          etags: entries.etags,
        });
      };

      const handleCallRequest = async ({
        fn,
        args,
      }: Extract<HandlerInput, { type: 'call' }>) => {
        const { value, entries, isOrigin } = await withRerender(
          () => fn(...args),
          () => parseServerFunctionOrigin(input.req),
        );
        return renderRscWithIntent(
          isOrigin
            ? { ...entries.elements, [IS_ORIGIN_ID]: true }
            : entries.elements,
          { value, etags: entries.etags },
        );
      };

      const handleHttpRequest = async ({
        pathname,
        req,
        tryAction,
      }: Extract<
        HandlerInput,
        { type: 'http' }
      >): ReturnType<HandleRequest> => {
        const query = new URL(req.url).searchParams.toString();
        let formState: unknown;
        const renderIntentResponse = (renderedPathname?: string) => {
          const requested = intent.value;
          if (!requested) {
            return;
          }
          if (!('location' in requested)) {
            return renderedPathname === '/404'
              ? undefined
              : renderNotFoundPage();
          }
          const url = new URL(req.url);
          const base = url.pathname.slice(
            0,
            url.pathname.length - pathname.length,
          );
          const target = new URL(requested.location, req.url);
          const location = requested.location.startsWith('/')
            ? base + target.pathname + target.search + target.hash
            : target.href;
          return new Response(null, {
            status: req.method === 'POST' ? 303 : requested.status,
            headers: { location, 'cache-control': 'private, no-store' },
          });
        };
        const renderPage = async (
          pathname: string,
          status: number,
          routerDefinition?: RouterDefinition,
          action?: NonNullable<typeof tryAction>,
        ): Promise<Response | null> => {
          const routePath = pathnameToRoutePath(pathname);
          const rscPath = encodeRoutePath(routePath);
          const rscParams = new URLSearchParams({ query });
          let entries = await routeEntries.getEntriesForRoute(
            rscPath,
            rscParams,
            clientEtags,
            requestElementCache,
            routerDefinition,
          );
          if (!entries) {
            return renderIntentResponse(pathname) ?? null;
          }
          if (action && !intent.value) {
            const { value, entries: rerendered } = await withRerender(
              action,
              () => [rscPath, rscParams] as const,
            );
            formState = value?.action ? value.formState : undefined;
            entries = {
              elements: { ...entries.elements, ...rerendered.elements },
              etags: { ...entries.etags, ...rerendered.etags },
            };
          }
          const requestedResponse = renderIntentResponse(pathname);
          if (requestedResponse) {
            return requestedResponse;
          }
          const nonce = getNonce();
          const response = await renderHtml(
            await renderRscWithIntent(entries.elements, {
              etags: entries.etags,
            }),
            <INTERNAL_ServerRouter
              route={{ path: routePath, query, hash: '' }}
            />,
            {
              rscPath,
              formState,
              status,
              ...(nonce ? { nonce } : {}),
              unstable_extraScriptContent: getRouterPrefetchCode(
                await getModuleIdsByPrefetchRegExp(),
              ),
            },
          );
          const replacement = renderIntentResponse(pathname);
          if (replacement) {
            void cancelRenderStream(response.body)?.catch(() => {});
            return replacement;
          }
          if (status === 404 && !response.headers.has('cache-control')) {
            response.headers.set('cache-control', 'private, no-store');
          }
          return response;
        };
        const renderNotFoundPage = async (): Promise<Response> => {
          if (await routeEntries.has404()) {
            try {
              const response = await renderPage('/404', 404);
              if (response) {
                return response;
              }
            } catch (error) {
              if (!canHandleRenderCancellation(error)) {
                throw error;
              }
              return renderIntentResponse('/404') ?? createNotFoundResponse();
            }
          }
          return createNotFoundResponse();
        };
        try {
          const requestedResponse = renderIntentResponse();
          if (requestedResponse) {
            return requestedResponse;
          }
          const resolved = await resolve(pathnameToRoutePath(pathname), query);
          const resolvedResponse = renderIntentResponse();
          if (resolvedResponse) {
            return resolvedResponse;
          }
          if (typeof resolved === 'function') {
            const url = new URL(req.url);
            url.pathname = pathname;
            return resolved(new Request(url, req));
          }
          if (resolved?.noSsr) {
            const nonce = getNonce();
            return renderHtmlFallback({ ...(nonce ? { nonce } : {}) });
          }
          if (resolved) {
            return await renderPage(pathname, 200, resolved, tryAction);
          }
          return (await routeEntries.has404()) ? renderNotFoundPage() : null;
        } catch (error) {
          if (!canHandleRenderCancellation(error)) {
            throw error;
          }
          return renderIntentResponse() ?? createNotFoundResponse();
        }
      };

      if (input.type === 'http') {
        return handleHttpRequest(input);
      }
      try {
        if (intent.value) {
          return renderIntentRsc();
        }
        if (input.type === 'rsc') {
          return await handleRscRequest(input);
        }
        if (input.type === 'call') {
          return await handleCallRequest(input);
        }
      } catch (error) {
        if (!canHandleRenderCancellation(error)) {
          throw error;
        }
        return renderIntentRsc();
      }
    };
    return runHandled(input.req, handleRequest);
  };
}
