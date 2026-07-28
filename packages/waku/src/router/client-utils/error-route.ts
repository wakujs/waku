import { unstable_getErrorInfo as getErrorInfo } from '../../minimal/client.js';
import {
  pathnameToRoutePath,
  type RouteProps,
} from '../isomorphic-utils/route-path.js';
import { getRouteUrl, parseRedirectUrl, parseRoute } from './route-url.js';

export type ErrorRoute =
  | { type: 'route'; target: RouteProps; url: URL }
  | { type: 'leave'; url: URL }
  | { type: 'unfollowable'; location: string }
  | { type: 'none' };

export const resolveErrorRoute = (
  error: unknown,
  attemptedUrl: URL,
  has404: boolean,
): ErrorRoute => {
  const info = getErrorInfo(error);
  if (info?.location) {
    const parsed = parseRedirectUrl(info.location, attemptedUrl);
    if (!parsed) {
      return { type: 'unfollowable', location: info.location };
    }
    if (parsed.origin !== window.location.origin) {
      return { type: 'leave', url: parsed };
    }
    // a protocol-relative location is another origin's, never an app path
    if (info.location.startsWith('/') && !info.location.startsWith('//')) {
      // an app location has no base path; the browser url gets it back
      const target = {
        path: pathnameToRoutePath(parsed.pathname),
        query: parsed.searchParams.toString(),
        hash: parsed.hash,
      };
      return { type: 'route', target, url: getRouteUrl(target) };
    }
    return { type: 'route', target: parseRoute(parsed), url: parsed };
  }
  if (info?.status === 404 && has404) {
    // the same query a direct request would render the 404 page with
    const target = {
      path: '/404',
      query: attemptedUrl.searchParams.toString(),
      hash: '',
    };
    // the 404 route renders while the url keeps the attempted location
    return { type: 'route', target, url: attemptedUrl };
  }
  return { type: 'none' };
};
