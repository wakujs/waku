import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';

const KEY = 'import.meta.env.WAKU_BUILD_ID';

export function buildIdPlugin(): Plugin {
  const buildId = randomUUID();
  return {
    name: 'waku:vite-plugins:build-id',
    config(merged, env) {
      if (merged.define && KEY in merged.define) {
        return;
      }
      return {
        define: {
          [KEY]: JSON.stringify(env.command === 'serve' ? 'dev' : buildId),
        },
      };
    },
  };
}
