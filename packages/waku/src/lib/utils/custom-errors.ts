type ErrorInfo = {
  status?: number;
  location?: string;
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

// a redirect the client must navigate itself, resolved against the request.
// only a scheme a browser can navigate to, never javascript: or data:
export const navigableRedirect = (
  err: unknown,
  baseUrl: string,
): URL | undefined => {
  const info = getErrorInfo(err);
  if (
    !info?.location ||
    !info.status ||
    info.status < 300 ||
    info.status > 399
  ) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(info.location, baseUrl);
  } catch {
    return undefined;
  }
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? url
    : undefined;
};
