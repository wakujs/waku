export const getRouterPrefetchCode = (
  moduleIdsByPrefetchRegExp: Record<string, string[]>,
) => {
  const moduleIdSet = new Set<string>();
  Object.values(moduleIdsByPrefetchRegExp).forEach((ids) =>
    ids.forEach((id) => moduleIdSet.add(id)),
  );
  const ids = Array.from(moduleIdSet);
  const indexesByRegExp: Record<string, number[]> = {};
  Object.entries(moduleIdsByPrefetchRegExp).forEach(([regExp, moduleIds]) => {
    indexesByRegExp[regExp] = moduleIds.map((id) => ids.indexOf(id));
  });
  return `
globalThis.__WAKU_ROUTER_PREFETCH__ = (path, callback) => {
  const ids = ${JSON.stringify(ids)};
  const indexesByRegExp = ${JSON.stringify(indexesByRegExp)};
  const key = Object.keys(indexesByRegExp).find((key) => new RegExp(key).test(path));
  for (const idx of indexesByRegExp[key] || []) {
    callback(ids[idx]);
  }
};
`;
};
