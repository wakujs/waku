import { addBase } from './path.js';

export const encodeRscPath = (rscPath: string) => {
  if (rscPath === '') {
    rscPath = '_';
  } else {
    if (rscPath.startsWith('_') || rscPath.startsWith('/')) {
      rscPath = '_' + rscPath;
    }
    if (rscPath.endsWith('_') || rscPath.endsWith('/')) {
      rscPath += '_';
    }
  }
  return rscPath + '.txt';
};

export const decodeRscPath = (rscPath: string) => {
  if (!rscPath.endsWith('.txt')) {
    throw new Error('Invalid encoded rscPath');
  }
  rscPath = rscPath.slice(0, -'.txt'.length);
  if (rscPath.startsWith('_')) {
    rscPath = rscPath.slice(1);
  }
  if (rscPath.endsWith('_')) {
    rscPath = rscPath.slice(0, -1);
  }
  return rscPath;
};

/**
 * Encodes `rscPath` under Waku's configured base path and RSC endpoint.
 * Returns a new URL preserving `baseUrl`'s origin, query, and fragment.
 * `baseUrl` must be absolute.
 */
export const formatRscUrl = (rscPath: string, baseUrl: string | URL): URL => {
  const url = new URL(baseUrl);
  url.pathname = addBase(
    '/' +
      (import.meta.env?.WAKU_CONFIG_RSC_BASE ?? 'RSC') +
      '/' +
      encodeRscPath(rscPath),
    import.meta.env?.WAKU_CONFIG_BASE_PATH ?? '/',
  );
  return url;
};

const SERVER_FUNCTION_PREFIX = 'F/';

export const encodeServerFunctionId = (serverFunctionId: string) => {
  const [file, name] = serverFunctionId.split('#') as [string, string];
  if (name.includes('/')) {
    throw new Error('Function name must not include `/`: ' + name);
  }
  if (file.startsWith('_') || file.startsWith('/')) {
    return SERVER_FUNCTION_PREFIX + '_' + file + '/' + name;
  }
  return SERVER_FUNCTION_PREFIX + file + '/' + name;
};

export const decodeServerFunctionId = (encoded: string) => {
  if (!encoded.startsWith(SERVER_FUNCTION_PREFIX)) {
    return null;
  }
  const index = encoded.lastIndexOf('/');
  const file = encoded.slice(SERVER_FUNCTION_PREFIX.length, index);
  const name = encoded.slice(index + 1);
  if (file.startsWith('_')) {
    return file.slice(1) + '#' + name;
  }
  return file + '#' + name;
};
