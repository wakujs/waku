import * as dotenv from 'dotenv';
import { defineConfig, type PluginOption } from 'vite';
import type { Config } from './config.js';
import { resolveConfig } from './lib/utils/config.js';
import { combinedPlugins } from './lib/vite-plugins/combined-plugins.js';

export { defineConfig };

/**
 * Waku Vite plugin.
 *
 * Usage in vite.config.ts:
 * ```ts
 * import { defineConfig } from 'vite'
 * import waku from 'waku/vite-plugins'
 *
 * export default defineConfig({
 *   plugins: [waku()],
 * })
 * ```
 */
export default function waku(config?: Config): PluginOption {
  // Load .env files (same as cli.ts does)
  dotenv.config({ path: ['.env.local', '.env'] });

  const resolved = resolveConfig(config);
  return combinedPlugins(resolved);
}

export { allowServerPlugin as unstable_allowServerPlugin } from './lib/vite-plugins/allow-server.js';
export { buildMetadataPlugin as unstable_buildMetadataPlugin } from './lib/vite-plugins/build-metadata.js';
export { combinedPlugins as unstable_combinedPlugins } from './lib/vite-plugins/combined-plugins.js';
export { cloudflarePlugin as unstable_cloudflarePlugin } from './lib/vite-plugins/cloudflare.js';
export { defaultAdapterPlugin as unstable_defaultAdapterPlugin } from './lib/vite-plugins/default-adapter.js';
export { extraPlugins as unstable_extraPlugins } from './lib/vite-plugins/extra-plugins.js';
export { fallbackHtmlPlugin as unstable_fallbackHtmlPlugin } from './lib/vite-plugins/fallback-html.js';
export { fsRouterTypegenPlugin as unstable_fsRouterTypegenPlugin } from './lib/vite-plugins/fs-router-typegen.js';
export { mainPlugin as unstable_mainPlugin } from './lib/vite-plugins/main.js';
export { notFoundPlugin as unstable_notFoundPlugin } from './lib/vite-plugins/not-found.js';
export { patchRsdwPlugin as unstable_patchRsdwPlugin } from './lib/vite-plugins/patch-rsdw.js';
export { privateDirPlugin as unstable_privateDirPlugin } from './lib/vite-plugins/private-dir.js';
export { userEntriesPlugin as unstable_userEntriesPlugin } from './lib/vite-plugins/user-entries.js';
export { virtualConfigPlugin as unstable_virtualConfigPlugin } from './lib/vite-plugins/virtual-config.js';
