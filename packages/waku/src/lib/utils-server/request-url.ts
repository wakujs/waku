import { removeBase } from '../utils-isomorphic/path.js';
import {
  decodeRscPath,
  decodeServerFunctionId,
} from '../utils-isomorphic/rsc-path.js';

const getBasePath = () => import.meta.env?.WAKU_CONFIG_BASE_PATH ?? '/';
const getRscBase = () => import.meta.env?.WAKU_CONFIG_RSC_BASE ?? 'RSC';

export const parseRequestUrl = (
  url: URL,
  basePath: string,
  rscBase: string,
) => {
  const pathname = removeBase(url.pathname, basePath);
  const prefix = '/' + rscBase + '/';
  if (!pathname.startsWith(prefix)) {
    return { type: 'http' as const, pathname };
  }
  const rscPath = decodeRscPath(pathname.slice(prefix.length));
  const serverFunctionId = decodeServerFunctionId(rscPath);
  if (serverFunctionId) {
    return { type: 'call' as const, pathname, serverFunctionId };
  }
  return { type: 'rsc' as const, pathname, rscPath };
};

type RequestInfo =
  | { type: 'http'; pathname: string; searchParams: URLSearchParams }
  | { type: 'rsc'; rscPath: string; rscParams: URLSearchParams | undefined }
  | { type: 'call' };

/**
 * Inspects a request URL using Waku's configured base path and RSC endpoint.
 * Returns HTTP path/query, RSC input, or a server-call classification, and
 * `null` for URLs outside the base path or with an invalid payload path.
 * Does not consume the body: body-backed RSC params are `undefined`, and
 * form actions addressed to document URLs are classified as HTTP.
 * This classification does not validate server function calls or authorize
 * requests.
 */
export const parseRequest = (req: Request): RequestInfo | null => {
  const url = new URL(req.url);
  let parsed: ReturnType<typeof parseRequestUrl>;
  try {
    parsed = parseRequestUrl(url, getBasePath(), getRscBase());
  } catch {
    return null;
  }
  if (parsed.type === 'http') {
    return {
      type: 'http',
      pathname: parsed.pathname,
      searchParams: url.searchParams,
    };
  }
  if (parsed.type === 'call') {
    return { type: 'call' };
  }
  return {
    type: 'rsc',
    rscPath: parsed.rscPath,
    rscParams: req.body === null ? url.searchParams : undefined,
  };
};
