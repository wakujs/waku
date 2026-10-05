export const getRouterPrefetchCode = (
  path2moduleIds: Record<string, string[]>,
) => {
  const moduleIdSet = new Set<string>();
  Object.values(path2moduleIds).forEach((ids) =>
    ids.forEach((id) => moduleIdSet.add(id)),
  );
  const ids = Array.from(moduleIdSet);
  const path2idxs: Record<string, number[]> = {};
  Object.entries(path2moduleIds).forEach(([path, pathIds]) => {
    path2idxs[path] = pathIds.map((id) => ids.indexOf(id));
  });
  return `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path, callback) => {
  const ids = ${JSON.stringify(ids)};
  const path2idxs = ${JSON.stringify(path2idxs)};
  const key = Object.keys(path2idxs).find((key) => new RegExp(key).test(path));
  for (const idx of path2idxs[key] || []) {
    callback(ids[idx]);
  }
};
`;
};
import type { Unstable_SearchCodec } from '../isomorphic-utils/search-codec-registry.js';

export const setupRouterSearchCodecs = (
  codecs: Record<string, Unstable_SearchCodec<any>>,
) => {
  const ids = Object.fromEntries(
    Object.entries(codecs).map(([path, codec]) => [path, codec.id]),
  );
  if (!Object.keys(ids).length) {
    return '';
  }
  (
    globalThis as { __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string> }
  ).__WAKU_ROUTER_SEARCH_CODECS__ = ids;
  const json = JSON.stringify(ids).replace(/</g, '\\u003c');
  return `\nglobalThis.__WAKU_ROUTER_SEARCH_CODECS__ = ${json};\n`;
};
