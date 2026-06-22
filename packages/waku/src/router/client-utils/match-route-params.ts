import { getGrouplessPath } from '../../lib/utils/create-pages.js';
import { getPathMapping, parsePathWithSlug } from '../../lib/utils/path.js';
import type { RouteParams } from '../create-pages-utils/inferred-path-types.js';
import type { RoutePattern } from './build-route-href.js';

/**
 * Match a concrete pathname against a route pattern and return its params, or
 * null when the pathname does not match. This is the inverse of buildRouteHref:
 * route groups are stripped, the existing matcher decides the match, and each
 * matched value is URL-decoded.
 */
export const matchRouteParams = <Pattern extends RoutePattern>(
  pattern: Pattern,
  pathname: string,
): RouteParams<Pattern> | null => {
  const pathSpec = parsePathWithSlug(getGrouplessPath(pattern));
  const mapping = getPathMapping(pathSpec, pathname);
  if (mapping === null) {
    return null;
  }
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(mapping)) {
    params[key] = Array.isArray(value)
      ? value.map((part) => decodeURIComponent(part))
      : decodeURIComponent(value);
  }
  return params as RouteParams<Pattern>;
};
