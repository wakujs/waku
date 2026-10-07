export type RouteProps<Path extends string = string> = {
  path: Path;
  query: string;
  hash: string;
};

export const addBase = (url: string, base: string) =>
  base !== '/' && url.startsWith('/') ? base.slice(0, -1) + url : url;

export const removeBase = (url: string, base: string) => {
  if (base === '/') {
    return url;
  }
  if (!url.startsWith(base)) {
    throw new Error('pathname must start with basePath: ' + url);
  }
  return url.slice(base.length - 1);
};

export const getGrouplessPath = (path: string) => {
  if (path.includes('(')) {
    const withoutGroups = path
      .split('/')
      .filter((part) => !part.startsWith('('));
    return withoutGroups.length > 1 ? withoutGroups.join('/') : '/';
  }
  return path;
};

const IGNORED_PATH_PARTS = new Set(['_actions', '_components', '_hooks']);

export const isIgnoredPath = (parts: string[]) =>
  parts.some((part) => IGNORED_PATH_PARTS.has(part));

export function pathnameToRoutePath(pathname: string): string {
  if (!pathname.startsWith('/')) {
    throw new Error('Pathname must start with `/`: ' + pathname);
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname.endsWith('/index.html')) {
    pathname = pathname.slice(0, -'/index.html'.length) || '/';
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname || '/';
}

export function getComponentIds(routePath: string): readonly string[] {
  const pathItems = routePath.split('/').filter(Boolean);
  const idSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const id = [...pathItems.slice(0, index), 'layout'].join('/');
    idSet.add(id);
  }
  idSet.add([...pathItems, 'page'].join('/'));
  return ['root', ...Array.from(idSet)];
}
