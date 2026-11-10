import path from 'node:path';
import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import { joinPath } from '../utils-isomorphic/path.js';

// Vite drops its default `server.fs.deny` entries when a plugin supplies any
const VITE_DEFAULT_FS_DENY = [
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
];
export const VITE_DEFAULT_FS_DENY_FOR_TEST = VITE_DEFAULT_FS_DENY;

const GLOB_SYMBOLS_RE =
  /(?<!\\)([()[\]{}*?|]|^!|[!+@](?=\()|\\(?![()[\]{}!*+?@|]))/g;

const escapeGlob = (filePath: string) =>
  filePath.replace(GLOB_SYMBOLS_RE, '\\$&');

export function privateDirPlugin({
  privateDir,
}: {
  privateDir: string;
}): Plugin {
  let privatePath: string;
  return {
    name: 'waku:vite-plugins:private-dir',
    enforce: 'pre',
    config: {
      order: 'post',
      handler(viteConfig) {
        const root = normalizePath(
          viteConfig.root ? path.resolve(viteConfig.root) : process.cwd(),
        );
        return {
          server: {
            fs: {
              deny: [
                ...(viteConfig.server?.fs?.deny ? [] : VITE_DEFAULT_FS_DENY),
                escapeGlob(joinPath(root, privateDir)) + '/**',
              ],
            },
          },
        };
      },
    },
    configResolved(viteConfig) {
      privatePath = joinPath(viteConfig.root, privateDir) + '/';
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
