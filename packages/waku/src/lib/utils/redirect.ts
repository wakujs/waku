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
  // requestUrl takes its scheme from the socket, so naming one here would send
  // an https app behind a proxy back to http
  const path = target.pathname + target.search + target.hash;
  if (target.host !== new URL(requestUrl).host) {
    return /^[a-z][a-z\d+.-]*:/i.test(location)
      ? target.href
      : '//' + target.host + path;
  }
  return location.startsWith('/') ? addBase(path, basePath) : path;
};
