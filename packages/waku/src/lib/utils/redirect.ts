import { addBase } from './path.js';

const hasControlCharacter = (value: string) =>
  [...value].some((char) => char < ' ' || char === '\u007f');

// never the location as given, so a control character in it cannot reach a
// header
export const resolveRedirectLocation = (
  location: string,
  requestUrl: string,
  basePath: string,
): string | undefined => {
  const request = new URL(requestUrl);
  let target: URL;
  try {
    target = new URL(location, request);
  } catch {
    return undefined;
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return undefined;
  }
  const named = /^([a-z][a-z\d+.-]*):/i.exec(location)?.[1]?.toLowerCase();
  const authority = !named && location.startsWith('//');
  if (!named && !authority && !location.startsWith('/')) {
    // a relative location belongs to the page that threw it, and an rsc
    // request is not that page, so the browser resolves this one
    return hasControlCharacter(location) ? undefined : location;
  }
  // credentials would reach a Location header and every log that reads one
  target.username = '';
  target.password = '';
  const path = target.pathname + target.search + target.hash;
  if (target.host !== request.host) {
    return named ? target.href : '//' + target.host + path;
  }
  // https is kept, so an app can send the browser to its secure origin, but
  // requestUrl takes its scheme from the socket and naming http here would
  // send an https app behind a proxy back to plaintext
  if (named === 'https') {
    return target.href;
  }
  // only an app path takes the base; the other spellings named the path whole
  return named || authority ? path : addBase(path, basePath);
};
