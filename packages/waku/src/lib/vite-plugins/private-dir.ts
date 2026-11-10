import path from 'node:path';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import { joinPath } from '../utils-isomorphic/path.js';

const FS_PREFIX = '/@fs/';
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:/;

const requestedFilePath = (
  url: string,
  root: string,
  base: string,
): string | undefined => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return undefined;
  }
  if (base !== '/' && pathname.startsWith(base)) {
    pathname = pathname.slice(base.length - 1);
  }
  if (pathname.startsWith(FS_PREFIX)) {
    const fsPath = pathname.slice(FS_PREFIX.length);
    return normalizePath(
      path.resolve(WINDOWS_DRIVE_RE.test(fsPath) ? fsPath : '/' + fsPath),
    );
  }
  return normalizePath(path.resolve(root, pathname.slice(1)));
};

const isInsidePrivateDir = (filePath: string, privatePath: string) => {
  const lowerFilePath = filePath.toLowerCase();
  const lowerPrivatePath = privatePath.toLowerCase();
  return (
    lowerFilePath === lowerPrivatePath.slice(0, -1) ||
    lowerFilePath.startsWith(lowerPrivatePath)
  );
};

export function privateDirPlugin({
  privateDir,
}: {
  privateDir: string;
}): Plugin {
  let privatePath: string;
  return {
    name: 'waku:vite-plugins:private-dir',
    enforce: 'pre',
    configResolved(viteConfig) {
      privatePath = joinPath(viteConfig.root, privateDir) + '/';
    },
    configureServer(server) {
      const { root, base } = server.config;
      server.middlewares.use((req, res, next) => {
        const filePath = requestedFilePath(req.url ?? '/', root, base);
        if (
          filePath !== undefined &&
          isInsidePrivateDir(filePath, privatePath)
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        next();
      });
    },
    load(id) {
      if (this.environment.name === 'rsc') {
        return;
      }
      if (id.startsWith(privatePath)) {
        throw new Error('Load private directory in client side is not allowed');
      }
    },
    hotUpdate(ctx) {
      if (this.environment.name === 'rsc' && ctx.file.startsWith(privatePath)) {
        ctx.server.environments.client.hot.send({
          type: 'custom',
          event: 'rsc:update',
          data: {
            type: 'waku:private',
            file: ctx.file,
          },
        });
      }
    },
  };
}
