export const parseOpts = (ext: string) => {
  if (ext === '.ts' || ext === '.tsx') {
    return {
      syntax: 'typescript',
      tsx: ext.endsWith('x'),
    } as const;
  }
  // We hoped to use 'typescript' for everything, but it fails in some cases.
  // https://github.com/wakujs/waku/issues/677
  return {
    syntax: 'ecmascript',
    jsx: ext.endsWith('x'),
  } as const;
};
