import { addBase } from './path.js';

const hasControlCharacter = (value: string) =>
  [...value].some((char) => char < ' ' || char === '\u007f');

const spellingOf = (location: string) => {
  if (/^[a-z][a-z\d+.-]*:/i.test(location)) {
    return 'absolute' as const;
  }
  if (location.startsWith('//')) {
    return 'authority' as const;
  }
  return location.startsWith('/')
    ? ('appPath' as const)
    : ('relative' as const);
};

const forTheBrowserToResolve = (location: string) =>
  hasControlCharacter(location) ? undefined : location;

export const resolveRedirectLocation = (
  location: string,
  requestUrl: string,
  basePath: string,
): string | undefined => {
  const spelling = spellingOf(location);
  if (spelling === 'relative') {
    return forTheBrowserToResolve(location);
  }
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
  target.username = '';
  target.password = '';
  const path = target.pathname + target.search + target.hash;
  if (target.host !== request.host) {
    return spelling === 'absolute' ? target.href : '//' + target.host + path;
  }
  // requestUrl takes its scheme from the socket, so http from there is no
  // evidence that the browser is on http
  if (spelling === 'absolute' && target.protocol === 'https:') {
    return target.href;
  }
  return spelling === 'appPath' ? addBase(path, basePath) : path;
};
