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
import type { SerializedElement } from './element-cache.js';
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

const REPLACED_RESPONSE_HEADERS = [
  'accept-ranges',
  'content-digest',
  'content-disposition',
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-md5',
  'content-range',
  'content-type',
  'digest',
  'etag',
  'expires',
  'last-modified',
  'location',
  'repr-digest',
];

const replaceHttpResponse = async (
  response: Response,
  createResponse: () => Response | Promise<Response>,
): Promise<Response> => {
  void cancelRenderStream(response.body)?.catch(() => {});
  const replacement = await createResponse();
  const headers = new Headers(response.headers);
  for (const name of REPLACED_RESPONSE_HEADERS) {
    headers.delete(name);
  }
  headers.set('cache-control', 'private, no-store');
  for (const [name, value] of replacement.headers) {
    if (name !== 'set-cookie') {
      headers.set(name, value);
    }
  }
  for (const cookie of replacement.headers.getSetCookie()) {
    headers.append('set-cookie', cookie);
  }
  return new Response(replacement.body, {
    status: replacement.status,
    statusText: replacement.statusText,
    headers,
  });
};

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
  hasInterceptors = () => false,
}: {
  resolve: Resolve;
  routeEntries: ReturnType<typeof createRouteEntries>;
  runHandled: <T>(req: Request, fn: () => Promise<T>) => Promise<T>;
  hasInterceptors?: () => boolean;
}): HandleRequest {
  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedModuleIdsByPrefetchRegExp: Record<string, string[]> | undefined;

  return async (
    input,
    { renderRsc, renderHtml, renderHtmlFallback, loadBuildMetadata },
  ) => {
    const redirectResponse = () => {
      const requested = getRouteIntent().value;
      if (!requested || !('location' in requested)) {
        return undefined;
      }
      const url = new URL(input.req.url);
      const base = url.pathname.slice(
        0,
        url.pathname.length - input.pathname.length,
      );
      const target = new URL(requested.location, input.req.url);
      const location = requested.location.startsWith('/')
        ? base + target.pathname + target.search + target.hash
        : target.href;
      return new Response(null, {
        status: input.req.method === 'POST' ? 303 : requested.status,
        headers: {
          location,
          'cache-control': 'private, no-store',
        },
      });
    };
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
      const renderRscWithIntent: RenderRsc = (elements, options) =>
        renderRsc(
          {
            ...elements,
            ...((hasInterceptors() || intent.value) && ROUTE_ID in elements
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
            SerializedElement
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
            return redirectResponse() ?? null;
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
          const requestedRedirect = redirectResponse();
          if (requestedRedirect) {
            return requestedRedirect;
          }
          if (getRouteIntent().value?.status === 404 && pathname !== '/404') {
            return renderNotFoundPage();
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
          const redirect = redirectResponse();
          if (
            redirect ||
            (getRouteIntent().value?.status === 404 && pathname !== '/404')
          ) {
            return replaceHttpResponse(
              response,
              () => redirect ?? renderNotFoundPage(),
            );
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
              if (
                (!isRenderCancellation(error) &&
                  !hasRenderCancellationDigest(error)) ||
                !intent.value
              ) {
                throw error;
              }
              return redirectResponse() ?? createNotFoundResponse();
            }
          }
          return createNotFoundResponse();
        };
        try {
          const requestedRedirect = redirectResponse();
          if (requestedRedirect) {
            return requestedRedirect;
          }
          if (getRouteIntent().value?.status === 404) {
            return renderNotFoundPage();
          }
          const resolved = await resolve(pathnameToRoutePath(pathname), query);
          const redirect = redirectResponse();
          if (redirect) {
            return redirect;
          }
          if (typeof resolved === 'function') {
            if (getRouteIntent().value?.status === 404) {
              return new Response('Not Found', {
                status: 404,
                headers: { 'cache-control': 'private, no-store' },
              });
            }
            const url = new URL(req.url);
            url.pathname = pathname;
            let response: Response;
            try {
              response = await resolved(new Request(url, req));
            } catch (error) {
              if (
                (!isRenderCancellation(error) &&
                  !hasRenderCancellationDigest(error)) ||
                !intent.value
              ) {
                throw error;
              }
              return (
                redirectResponse() ??
                new Response('Not Found', {
                  status: 404,
                  headers: { 'cache-control': 'private, no-store' },
                })
              );
            }
            const redirect = redirectResponse();
            if (redirect || getRouteIntent().value?.status === 404) {
              return replaceHttpResponse(
                response,
                () =>
                  redirect ??
                  new Response('Not Found', {
                    status: 404,
                    headers: { 'cache-control': 'private, no-store' },
                  }),
              );
            }
            return response;
          }
          if (getRouteIntent().value?.status === 404) {
            return renderNotFoundPage();
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
          if (
            (!isRenderCancellation(error) &&
              !hasRenderCancellationDigest(error)) ||
            !intent.value
          ) {
            throw error;
          }
          return redirectResponse() ?? renderNotFoundPage();
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
        if (
          (!isRenderCancellation(error) &&
            !hasRenderCancellationDigest(error)) ||
          !intent.value
        ) {
          throw error;
        }
        return renderIntentRsc();
      }
    };
    return runHandled(input.req, handleRequest);
  };
}
