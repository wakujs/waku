import {
  unstable_cancelRender as cancelRender,
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

const replaceHttpResponse = async <T,>(
  response: Response | undefined,
  createResponse: () => T,
): Promise<Response | Awaited<T>> => {
  void cancelRenderStream(response?.body ?? null)?.catch(() => {});
  const replacement = await createResponse();
  if (!response || !(replacement instanceof Response)) {
    return replacement;
  }
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

export const createRequestHandler = ({
  resolve,
  routeEntries,
  runHandled,
  hasInterceptors = () => false,
}: {
  resolve: Resolve;
  routeEntries: ReturnType<typeof createRouteEntries>;
  runHandled: <T>(
    req: Request,
    fn: () => Promise<T>,
    onCancel?: () => Promise<T>,
    onResponse?: (response: T) => Promise<T>,
  ) => Promise<T>;
  hasInterceptors?: () => boolean;
}): HandleRequest => {
  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedModuleIdsByPrefetchRegExp: Record<string, string[]> | undefined;

  return async (
    input,
    { renderRsc, renderHtml, renderHtmlFallback, loadBuildMetadata },
  ) => {
    let isApiRequest = false;
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
    const renderCancelledRequest = async (): ReturnType<HandleRequest> => {
      const intent = getRouteIntent();
      if (!intent.value) {
        cancelRender();
      }
      if (input.type === 'http') {
        return (
          redirectResponse() ??
          (isApiRequest
            ? new Response('Not Found', { status: 404 })
            : handleRequest(true))
        );
      }
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
    const settleHttpResponse = async (
      response: Awaited<ReturnType<HandleRequest>>,
    ) => {
      const httpResponse = response instanceof Response ? response : undefined;
      const redirect = redirectResponse();
      if (
        !redirect &&
        (getRouteIntent().value?.status !== 404 || httpResponse?.status === 404)
      ) {
        if (
          getRouteIntent().value?.status === 404 &&
          httpResponse &&
          !httpResponse.headers.has('cache-control')
        ) {
          const headers = new Headers(httpResponse.headers);
          headers.set('cache-control', 'private, no-store');
          return new Response(httpResponse.body, {
            status: httpResponse.status,
            statusText: httpResponse.statusText,
            headers,
          });
        }
        return response;
      }
      if (
        redirect &&
        httpResponse?.status === redirect.status &&
        httpResponse.headers.get('location') ===
          redirect.headers.get('location')
      ) {
        return response;
      }
      return replaceHttpResponse(
        httpResponse,
        () => redirect ?? renderCancelledRequest(),
      );
    };
    const handleRequest = async (
      cancelled = false,
    ): ReturnType<HandleRequest> => {
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
        let entriesPromise: Promise<RouteEntries> = Promise.resolve({
          elements: {},
          etags: {},
        });
        let rendered = false;
        let isOrigin = false;
        const rerender = (rscPath?: string, rscParams?: unknown) => {
          if (rendered) {
            throw new Error('already rendered');
          }
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
          entriesPromise = Promise.all([
            entriesPromise,
            routeEntries.getEntriesForRoute(
              rscPath,
              rscParams,
              clientEtags,
              requestElementCache,
            ),
          ]).then(([oldEntries, newEntries]) => {
            if (newEntries === null) {
              console.warn('getEntries returned null');
              return oldEntries;
            }
            return {
              elements: { ...oldEntries.elements, ...newEntries.elements },
              etags: { ...oldEntries.etags, ...newEntries.etags },
            };
          });
        };
        setRerender(rerender);
        try {
          const value = await fn();
          return { value, entries: await entriesPromise, isOrigin };
        } finally {
          rendered = true;
        }
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
            return intent.value ? renderCancelledRequest() : null;
          }
          return renderRscWithIntent(entries.elements, {
            etags: entries.etags,
          });
        }
        let entries: RouteEntries | null = null;
        try {
          entries = await routeEntries.getEntriesForRoute(
            rscPath,
            rscParams,
            clientEtags,
            requestElementCache,
          );
        } catch (e) {
          if (isRenderCancellation(e)) {
            return renderCancelledRequest();
          }
          throw e;
        }
        if (!entries && (await routeEntries.has404())) {
          entries = await routeEntries.getEntriesForRoute(
            encodeRoutePath('/404'),
            rscParams,
            clientEtags,
            requestElementCache,
          );
        }
        if (!entries) {
          return intent.value ? renderCancelledRequest() : null;
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
      }: Extract<HandlerInput, { type: 'http' }>) => {
        let actionResult: ReturnType<NonNullable<typeof tryAction>> | undefined;
        const query = new URL(req.url).searchParams.toString();
        let resolved;
        try {
          resolved = cancelled
            ? null
            : await resolve(pathnameToRoutePath(pathname), query);
        } catch (error) {
          if (!isRenderCancellation(error)) {
            throw error;
          }
          return renderCancelledRequest();
        }
        const beforeRenderRedirect = redirectResponse();
        if (beforeRenderRedirect) {
          return beforeRenderRedirect;
        }
        if (typeof resolved === 'function') {
          isApiRequest = true;
          const url = new URL(req.url);
          url.pathname = pathname;
          const apiReq = new Request(url, req);
          let response;
          try {
            response = await resolved(apiReq);
          } catch (error) {
            if (!isRenderCancellation(error)) {
              throw error;
            }
            return renderCancelledRequest();
          }
          const redirect = redirectResponse();
          if (redirect || intent.value?.status === 404) {
            return replaceHttpResponse(
              response,
              () => redirect ?? new Response('Not Found', { status: 404 }),
            );
          }
          return response;
        }
        const renderPage = async (
          pathname: string,
          query: string,
          status = 200,
          routerDefinition?: RouterDefinition,
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
            return null;
          }
          const route = { path: routePath, query, hash: '' };
          const nonce = getNonce();
          const html = <INTERNAL_ServerRouter route={route} />;
          let formState: unknown;
          if (tryAction && !cancelled && (!intent.value || actionResult)) {
            const { value, entries: rerendered } = await withRerender(
              () => (actionResult ??= tryAction()),
              () => [rscPath, rscParams] as const,
            );
            formState = value?.action ? value.formState : undefined;
            entries = {
              elements: { ...entries.elements, ...rerendered.elements },
              etags: { ...entries.etags, ...rerendered.etags },
            };
          }
          const response = await renderHtml(
            await renderRscWithIntent(entries.elements, {
              etags: entries.etags,
            }),
            html,
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
            (intent.value?.status === 404 && pathname !== '/404')
          ) {
            return replaceHttpResponse(
              response,
              async () =>
                redirect ??
                ((await routeEntries.has404())
                  ? renderNotFoundPage()
                  : createNotFoundResponse()),
            );
          }
          return response;
        };
        const renderNotFoundPage = async () => {
          try {
            return await renderPage('/404', query, 404);
          } catch (error) {
            if (
              intent.value?.status !== 404 ||
              (!isRenderCancellation(error) &&
                !hasRenderCancellationDigest(error))
            ) {
              throw error;
            }
            return createNotFoundResponse();
          }
        };
        if (intent.value?.status === 404) {
          return (await routeEntries.has404())
            ? renderNotFoundPage()
            : createNotFoundResponse();
        }
        if (resolved?.noSsr) {
          const nonce = getNonce();
          return renderHtmlFallback({
            ...(nonce ? { nonce } : {}),
          });
        }
        try {
          if (resolved) {
            return await renderPage(pathname, query, 200, resolved);
          }
        } catch (e) {
          if (!isRenderCancellation(e) && !hasRenderCancellationDigest(e)) {
            throw e;
          }
          return renderCancelledRequest();
        }
        if (await routeEntries.has404()) {
          return renderNotFoundPage();
        } else {
          return null;
        }
      };

      if (input.type === 'rsc') {
        return handleRscRequest(input);
      }
      if (input.type === 'call') {
        return handleCallRequest(input);
      }
      if (input.type === 'http') {
        return handleHttpRequest(input);
      }
    };
    return runHandled(
      input.req,
      handleRequest,
      renderCancelledRequest,
      input.type === 'http' ? settleHttpResponse : undefined,
    );
  };
};
