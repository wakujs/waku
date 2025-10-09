import type { UserConfig, Plugin } from 'vite';

export type { Plugin as VitePlugin };

export type { Middleware } from './lib/types.js';

export interface Config {
  /**
   * The base path for serve HTTP.
   * Defaults to  "/".
   * TODO https://github.com/wakujs/waku/issues/698
   */
  basePath?: string;
  /**
   * The source directory relative to root.
   * Defaults to  "src".
   */
  srcDir?: string;
  /**
   * The dist directory relative to root.
   * This will be the folder to contain the built files.
   * Defaults to  "dist".
   */
  distDir?: string;
  /**
   * The pages directory relative to srcDir.
   * Defaults to "pages".
   */
  pagesDir?: string;
  /**
   * The api directory inside pagesDir.
   * Defaults to "api".
   */
  apiDir?: string;
  /**
   * The slices directory inside pagesDir.
   * Defaults to "_slices".
   */
  slicesDir?: string;
  /**
   * The private directory relative to root.
   * This folder will contain files that should be read only on the server.
   * Defaults to  "private".
   */
  privateDir?: string;
  /**
   * Bse path for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscBase?: string;
  /**
   * Middleware to use
   * Defaults to: []
   * @deprecated This will be removed soon.
   */
  middleware?: (string & {})[];
  /**
   * Enhancer for Hono
   * Defaults to `undefined`
   */
  unstable_honoEnhancer?: string | undefined;
  /**
   * Vite configuration options.
   * See https://vite.dev/guide/api-environment-plugins.html#environment-api-for-plugins
   * for how to configure or enable plugins per environment.
   */
  vite?: UserConfig | undefined;
}

export function defineConfig(config: Config) {
  return config;
}
