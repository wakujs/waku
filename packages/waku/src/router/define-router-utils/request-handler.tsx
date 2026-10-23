// eslint-disable-next-line no-restricted-imports -- Discarded responses use Minimal's internal stream cancellation.
import { unstable_cancelRenderStream as cancelRenderStream } from 'waku/internals';
import { unstable_isRenderCancellation as isRenderCancellation } from 'waku/minimal/server';
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
  decodeSliceId,
  encodeRoutePath,
  getSliceSlotId,
} from '../isomorphic-utils/router-protocol.js';
import { ROUTER_METADATA } from './build-metadata.js';
import { getRouterPrefetchCode } from './client-code.js';
import { createElementCache } from './element-cache.js';
import type { SerializedElement } from './element-cache.js';
import { getNonce, getRouteIntent, setRerender } from './request-store.js';
import type { Resolve, Route, createRouteEntries } from './route-entries.js';

type RouteEntries = {
  elements: Record<string, unknown>;
  etags: Record<string, string | 1>;
};

type HandlerInput = Parameters<HandleRequest>[0];

const createNotFoundResponse = () =>
  new Response(
    '<!doctype html><html><head><title>Not Found</title></head><body><h1>Not Found</h1></body></html>',
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } },
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

const parseActionOrigin = (req: Request) => {
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
}: {
  resolve: Resolve;
  routeEntries: ReturnType<typeof createRouteEntries>;
  runHandled: <T>(
    req: Request,
    fn: () => Promise<T>,
    onCancel?: () => Promise<T>,
  ) => Promise<T>;
}): HandleRequest => {
  const requestElementCache = createElementCache();
  let requestElementCacheInit: Promise<void> | undefined;
  let cachedPath2moduleIds: Record<string, string[]> | undefined;

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
    const renderCancelledRequest = async () => {
      const intent = getRouteIntent();
      if (input.type === 'http') {
        return (
          redirectResponse() ??
          (intent.value?.status === 404
            ? createNotFoundResponse()
            : new Response(null))
        );
      }
      if (input.type === 'rsc' && decodeSliceId(input.rscPath) === null) {
        const entries = await routeEntries.getEntriesForRoute(
          input.rscPath,
          input.rscParams,
          input.etags ?? {},
          requestElementCache,
          {
            route: {
              elements: {
                root: { render: () => null },
                route: { render: () => null },
              },
            },
          },
        );
        return renderRsc(
          { ...entries!.elements, [INTENT_ID]: intent.promise },
          { etags: entries!.etags },
        );
      }
      return renderRsc({ [INTENT_ID]: intent.promise });
    };
    const handleRequest = async () => {
      const intent = getRouteIntent();
      const renderRscWithIntent: RenderRsc = (elements, options) =>
        renderRsc({ ...elements, [INTENT_ID]: intent.promise }, options);
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
      const getPath2moduleIds = async () => {
        if (!cachedPath2moduleIds) {
          cachedPath2moduleIds = JSON.parse(
            (await loadBuildMetadata(ROUTER_METADATA.path2moduleIds)) || '{}',
          );
        }
        return cachedPath2moduleIds!;
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
              throw new Error('The route this action came from is unknown');
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
          const value = await fn().catch((error: unknown) => {
            if (!isRenderCancellation(error)) {
              throw error;
            }
          });
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
            return null;
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
          () => parseActionOrigin(input.req),
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
        const resolved = await resolve(
          pathnameToRoutePath(pathname),
          query,
        ).catch((error) => {
          if (!isRenderCancellation(error)) {
            throw error;
          }
          return null;
        });
        const beforeRenderRedirect = redirectResponse();
        if (beforeRenderRedirect) {
          return beforeRenderRedirect;
        }
        if (typeof resolved === 'function') {
          const url = new URL(req.url);
          url.pathname = pathname;
          const apiReq = new Request(url, req);
          const response = await resolved(apiReq).catch((error: unknown) => {
            if (!isRenderCancellation(error)) {
              throw error;
            }
            return new Response(null);
          });
          const redirect = redirectResponse();
          if (redirect) {
            await cancelRenderStream(response.body);
            return redirect;
          }
          if (intent.value?.status === 404) {
            await cancelRenderStream(response.body);
            return new Response('Not Found', { status: 404 });
          }
          return response;
        }
        const renderPage = async (
          pathname: string,
          query: string,
          status = 200,
          resolvedRoute?: Route,
        ): Promise<Response | null> => {
          const routePath = pathnameToRoutePath(pathname);
          const rscPath = encodeRoutePath(routePath);
          const rscParams = new URLSearchParams({ query });
          let entries = await routeEntries.getEntriesForRoute(
            rscPath,
            rscParams,
            clientEtags,
            requestElementCache,
            { route: resolvedRoute },
          );
          if (!entries) {
            return null;
          }
          const route = { path: routePath, query, hash: '' };
          const nonce = getNonce();
          const html = <INTERNAL_ServerRouter route={route} />;
          let formState: unknown;
          if (tryAction) {
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
                await getPath2moduleIds(),
              ),
            },
          );
          const requested = intent.value;
          const redirect = redirectResponse();
          if (redirect) {
            await cancelRenderStream(response.body);
            return redirect;
          }
          if (requested?.status === 404 && pathname !== '/404') {
            await cancelRenderStream(response.body);
            return (await routeEntries.has404())
              ? renderPage('/404', query, 404)
              : createNotFoundResponse();
          }
          return response;
        };
        if (intent.value?.status === 404) {
          return (await routeEntries.has404())
            ? renderPage('/404', query, 404)
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
          if (!isRenderCancellation(e)) {
            throw e;
          }
          const redirect = redirectResponse();
          if (redirect) {
            return redirect;
          }
        }
        if (await routeEntries.has404()) {
          // the 404 page renders for the url that was asked for, query and all
          return renderPage('/404', query, 404);
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
    return runHandled(input.req, handleRequest, renderCancelledRequest);
  };
};
