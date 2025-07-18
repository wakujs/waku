export type RouteProps<Path extends string = string> = {
  path: Path;
  query: string;
  hash: string;
};

export function getComponentIds(path: string): readonly string[] {
  const pathItems = path.split('/').filter(Boolean);
  const idSet = new Set<string>();
  for (let index = 0; index <= pathItems.length; ++index) {
    const id = [...pathItems.slice(0, index), 'layout'].join('/');
    idSet.add(id);
  }
  idSet.add([...pathItems, 'page'].join('/'));
  return ['root', ...Array.from(idSet)];
}

const ROUTE_PREFIX = 'R';
const SLICE_PREFIX = 'S/';

export function encodeRoutePath(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error('Path must start with `/`: ' + path);
  }
  if (path === '/') {
    return ROUTE_PREFIX + '/_root';
  }
  if (path.endsWith('/')) {
    throw new Error('Path must not end with `/`: ' + path);
  }
  return ROUTE_PREFIX + path;
}

export function decodeRoutePath(rscPath: string): string {
  if (!rscPath.startsWith(ROUTE_PREFIX)) {
    throw new Error('rscPath should start with: ' + ROUTE_PREFIX);
  }
  if (rscPath === ROUTE_PREFIX + '/_root') {
    return '/';
  }
  return rscPath.slice(ROUTE_PREFIX.length);
}

// LIMITATION: This is very limited because it does not support fetching multiple slices in one request. We should generally prefer sending slices with the route if possible.
export function encodeSliceId(sliceId: string): string {
  if (sliceId.startsWith('/')) {
    throw new Error('Slice id must not start with `/`: ' + sliceId);
  }
  return SLICE_PREFIX + sliceId;
}

export function decodeSliceId(rscPath: string): string | null {
  if (!rscPath.startsWith(SLICE_PREFIX)) {
    return null;
  }
  return rscPath.slice(SLICE_PREFIX.length);
}

export const ROUTE_ID = 'ROUTE';
export const IS_STATIC_ID = 'IS_STATIC';
export const HAS404_ID = 'HAS404';
export const DELEGATED_ERROR_ID = 'DELEGATED_ERROR';

// For HTTP header
export const SKIP_HEADER = 'X-Waku-Router-Skip';
