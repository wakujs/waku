type ErrorInfo = {
  status?: number;
  location?: string;
  // set by the client when the request produced no response at all
  noResponse?: boolean;
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
  if ('noResponse' in x && typeof (x as ErrorInfo).noResponse !== 'boolean') {
    return false;
  }
  return true;
};

const prefix = '__WAKU_CUSTOM_ERROR__;';

// This is an internal API and not for public use
export const createCustomError = (message: string, errorInfo: ErrorInfo) =>
  markCustomError(new Error(message), errorInfo);

// Adds the info to an error as it is, so its type and stack survive.
// This is an internal API and not for public use
export function markCustomError<T>(err: T, errorInfo: ErrorInfo): T | Error {
  if (typeof err !== 'object' || err === null) {
    return createCustomError(String(err), errorInfo);
  }
  (err as { digest?: string }).digest = prefix + JSON.stringify(errorInfo);
  return err;
}

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
