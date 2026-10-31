import type { NavigationHref } from '../isomorphic-utils/build-route-href.js';
import {
  addBase,
  pathnameToRoutePath,
  removeBase,
} from '../isomorphic-utils/route-path.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export function pathnameToCurrentRoutePath(pathname: string) {
  return pathnameToRoutePath(
    removeBase(pathname, import.meta.env.WAKU_CONFIG_BASE_PATH),
  );
}

export function resolveRouteHref(to: NavigationHref): string {
  return addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
}

export const isInsideBase = (url: URL) =>
  url.pathname.startsWith(import.meta.env.WAKU_CONFIG_BASE_PATH);

export function parseRoute(url: URL): RouteProps {
  const { pathname, searchParams, hash } = url;
  return {
    path: pathnameToCurrentRoutePath(pathname),
    query: searchParams.toString(),
    hash,
  };
}

export function getRouteUrl(route: RouteProps): URL {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = addBase(route.path, import.meta.env.WAKU_CONFIG_BASE_PATH);
  nextUrl.search = route.query;
  nextUrl.hash = route.hash;
  return nextUrl;
}

export function isSameRoute(next: RouteProps, prev: RouteProps) {
  return (
    next.path === prev.path &&
    next.query === prev.query &&
    next.hash === prev.hash
  );
}

type RscRoute = Pick<RouteProps, 'path' | 'query'>;

export function isSameRscRoute(next: RscRoute, prev: RscRoute) {
  return next.path === prev.path && next.query === prev.query;
}

export function parseRedirectUrl(location: string, base: string | URL) {
  let url: URL;
  try {
    url = new URL(location, base);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return undefined;
  }
  url.username = '';
  url.password = '';
  // a location the server never resolved can name this host over plaintext,
  // and the browser is the one that knows the scheme it is on
  if (url.protocol === 'http:' && url.host === window.location.host) {
    url.protocol = window.location.protocol;
  }
  return url;
}

export function redactCredentials(location: string) {
  return location.replace(/\/\/[^/@]*@/, '//');
}
