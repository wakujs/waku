import path from 'node:path';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';

function relativePath(pathFrom: string, pathTo: string) {
  let relPath = path.posix.relative(pathFrom, pathTo);
  if (!relPath.startsWith('.')) {
    relPath = './' + relPath;
  }
  return relPath;
}

export function pathMacroPlugin(): Plugin {
  const token = 'import.meta.__WAKU_ORIGINAL_PATH__';
  let rootDir: string;
  return {
    name: 'waku:vite-plugins:path-macro',
    enforce: 'pre',
    configResolved(viteConfig) {
      rootDir = viteConfig.root;
    },
    transform(code, id) {
      if (id.startsWith('\0') || id.includes('virtual:')) {
        return;
      }
      const normalizedPath = id.split('?')[0]!;
      if (!['.js', '.mjs', '.cjs'].includes(path.extname(normalizedPath))) {
        return;
      }
      if (!code.includes(token)) {
        return;
      }
      const originalPath = relativePath(rootDir, normalizedPath);
      const s = new MagicString(code);
      let idx = code.indexOf(token);
      if (idx === -1) {
        return;
      }
      while (idx !== -1) {
        s.overwrite(idx, idx + token.length, JSON.stringify(originalPath));
        idx = code.indexOf(token, idx + 1);
      }
      return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
      };
    },
  };
}
