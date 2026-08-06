import { addBase } from './path.js';

// never the location as given, so a control character in it cannot reach a
// header
export const resolveRedirectLocation = (
  location: string,
  requestUrl: string,
  basePath: string,
): string | undefined => {
  let target: URL;
  try {
    target = new URL(location, requestUrl);
  } catch {
    return undefined;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return undefined;
  }
  const named = /^([a-z][a-z\d+.-]*):/i.exec(location)?.[1]?.toLowerCase();
  const path = target.pathname + target.search + target.hash;
  if (target.host !== new URL(requestUrl).host) {
    return named ? target.href : '//' + target.host + path;
  }
  // https is kept, so an app can send the browser to its secure origin, but
  // requestUrl takes its scheme from the socket and naming http here would
  // send an https app behind a proxy back to plaintext
  if (named === 'https') {
    return target.href;
  }
  return location.startsWith('/') ? addBase(path, basePath) : path;
};
