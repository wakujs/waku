import type { UserConfig } from 'vite';

export interface Config {
  /**
   * The base path for serve HTTP.
   * Defaults to  "/".
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
   * The private directory relative to root.
   * This folder will contain files that should be read only on the server.
   * Defaults to  "private".
   */
  privateDir?: string;
  /**
   * Base path for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscBase?: string;
  /**
   * Adapter module name
   * Defaults to "waku/adapters/node" or other platform-specific adapters based on environment variables.
   */
  adapter?: string;
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
