import { addBase } from './path.js';

type ErrorInfo = {
  status?: number;
  location?: string;
  // reach this by navigating the document; no route can answer it
  unstable_documentLocation?: string;
  // set by the client, read by no one in waku: an app decides its own recovery
  unstable_networkError?: boolean;
};

const isErrorInfo = (x: unknown): x is ErrorInfo => {
  if (typeof x !== 'object' || x === null) {
    return false;
  }
  if ('status' in x && typeof (x as ErrorInfo).status !== 'number') {
    return false;
  }
  if ('location' in x && typeof (x as ErrorInfo).location !== 'string') {
    return false;
  }
  if (
    'unstable_documentLocation' in x &&
    typeof (x as ErrorInfo).unstable_documentLocation !== 'string'
  ) {
    return false;
  }
  if (
    'unstable_networkError' in x &&
    typeof (x as ErrorInfo).unstable_networkError !== 'boolean'
  ) {
    return false;
  }
  return true;
};

const prefix = '__WAKU_CUSTOM_ERROR__;';

// This is an internal API and not for public use
export const createCustomError = (message: string, errorInfo: ErrorInfo) => {
  const err = new Error(message);
  (err as { digest?: string }).digest = prefix + JSON.stringify(errorInfo);
  return err;
};

export const getErrorInfo = (err: unknown) => {
  const digest = (err as { digest?: string } | undefined)?.digest;
  if (typeof digest !== 'string' || !digest.startsWith(prefix)) {
    return null;
  }
  try {
    const info = JSON.parse(digest.slice(prefix.length));
    if (isErrorInfo(info)) {
      return info;
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * Where the browser must go for this error, or undefined if there is nowhere
 * it may go. Only a scheme a browser can navigate to, never javascript: or
 * data:, and never the raw location, so a control character in it cannot
 * reach a header.
 */
export const resolveRedirectLocation = (
  err: unknown,
  requestUrl: string,
  basePath: string,
): string | undefined => {
  const location = getErrorInfo(err)?.location;
  if (!location) {
    return undefined;
  }
  let target: URL;
  try {
    target = new URL(location, requestUrl);
  } catch {
    return undefined;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return undefined;
  }
  // requestUrl takes its scheme from the socket, so naming one here would send
  // an https app behind a proxy back to http; the browser keeps its own
  const path = target.pathname + target.search + target.hash;
  if (target.host !== new URL(requestUrl).host) {
    return /^[a-z][a-z\d+.-]*:/i.test(location)
      ? target.href
      : '//' + target.host + path;
  }
  return location.startsWith('/') ? addBase(path, basePath) : path;
};
