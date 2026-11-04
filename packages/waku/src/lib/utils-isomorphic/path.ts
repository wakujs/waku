// for filePath
export function joinPath(...paths: string[]) {
  const isAbsolute = paths[0]?.startsWith('/');
  const items = ([] as string[]).concat(
    ...paths.map((path) => path.split('/')),
  );
  const stack: string[] = [];
  for (const item of items) {
    if (item === '..') {
      if (stack.length && stack[stack.length - 1] !== '..') {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push('..');
      }
    } else if (item && item !== '.') {
      stack.push(item);
    }
  }
  return (isAbsolute ? '/' : '') + stack.join('/') || '.';
}

// basePath config is ensured to have trailing slash (see plugin)
export function removeBase(url: string, base: string) {
  if (base !== '/') {
    if (!url.startsWith(base)) {
      throw new Error('pathname must start with basePath: ' + url);
    }
    return url.slice(base.length - 1);
  }
  return url;
}

export function addBase(url: string, base: string) {
  if (base !== '/' && url.startsWith('/')) {
    return base.slice(0, -1) + url;
  }
  return url;
}
