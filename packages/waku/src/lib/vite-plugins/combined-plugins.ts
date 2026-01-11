import rsc from '@vitejs/plugin-rsc';
import type { PluginOption } from 'vite';
import type { Config } from '../../config.js';
import { allowServerPlugin } from './allow-server.js';
import { buildMetadataPlugin } from './build-metadata.js';
import { cloudflarePlugin } from './cloudflare.js';
import { defaultAdapterPlugin } from './default-adapter.js';
import { extraPlugins } from './extra-plugins.js';
import { fallbackHtmlPlugin } from './fallback-html.js';
import { fsRouterTypegenPlugin } from './fs-router-typegen.js';
import { mainPlugin } from './main.js';
import { notFoundPlugin } from './not-found.js';
import { patchRsdwPlugin } from './patch-rsdw.js';
import { privateDirPlugin } from './private-dir.js';
import { userEntriesPlugin } from './user-entries.js';
import { virtualConfigPlugin } from './virtual-config.js';

export function combinedPlugins(config: Required<Config>): PluginOption {
  return [
    extraPlugins(config),
    allowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    cloudflarePlugin(),
    rsc({
      serverHandler: false,
      keepUseCientProxy: true,
      useBuildAppHook: true,
      clientChunks: (meta) => meta.serverChunk,
    }),
    mainPlugin(config),
    userEntriesPlugin(config),
    virtualConfigPlugin(config),
    defaultAdapterPlugin(config),
    notFoundPlugin(),
    patchRsdwPlugin(),
    buildMetadataPlugin(config),
    privateDirPlugin(config),
    fallbackHtmlPlugin(),
    fsRouterTypegenPlugin(config),
  ];
}
