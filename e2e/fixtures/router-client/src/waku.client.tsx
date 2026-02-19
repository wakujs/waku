import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import {
  type Unstable_RouteProps as RouteProps,
  Router,
} from 'waku/router/client';

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
    <Router unstable_routeInterceptor={routeInterceptor} />
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document.body, rootElement);
} else {
  createRoot(document.body).render(rootElement);
}
