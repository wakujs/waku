import type { Config } from './lib/utils/config.js';

export type { Plugin as VitePlugin } from 'vite';

export { resolveConfig as unstable_resolveConfig } from './lib/utils/config.js';

export type { Config };

// HACK I don't know why this works.
declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export function defineConfig(config: Config) {
  return config;
}
