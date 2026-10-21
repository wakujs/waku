import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import type { Unstable_RscEnhancer } from 'waku/minimal/client';
import { Router } from 'waku/router/client';
import type { Unstable_RouteProps as RouteProps } from 'waku/router/client-core';

const rscEnhancer: Unstable_RscEnhancer = (next) => (path, params, options) =>
  next(path, params, {
    ...options,
    fetch: (input, init) => {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.set('X-Rsc-Enhancer', 'configured');
      return options.fetch(input, { ...init, headers });
    },
  });

const routeInterceptor = (route: RouteProps) => {
  const interceptor = new URL(window.location.href).searchParams.get(
    '__interceptor',
  );
  if (interceptor === 'block') {
    return false;
  }
  if (interceptor === 'rewrite') {
    return { path: '/intercepted', query: 'from=interceptor', hash: '' };
  }
  return route;
};

const rootElement = (
  <StrictMode>
    <Router
      unstable_routeInterceptor={routeInterceptor}
      unstable_rscEnhancers={[rscEnhancer]}
    />
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document.body, rootElement, defaultRootOptions);
} else {
  createRoot(document.body, defaultRootOptions).render(rootElement);
}
