import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import type { PluginOption } from 'vite';
import type { Config } from '../../config.js';
import { allowServerPlugin } from '../vite-plugins/allow-server.js';
import { buildMetadataPlugin } from '../vite-plugins/build-metadata.js';
import { defaultAdapterPlugin } from '../vite-plugins/default-adapter.js';
import { fallbackHtmlPlugin } from '../vite-plugins/fallback-html.js';
import { fsRouterTypegenPlugin } from '../vite-plugins/fs-router-typegen.js';
import { mainPlugin } from '../vite-plugins/main.js';
import { notFoundPlugin } from '../vite-plugins/not-found.js';
import { patchRsdwPlugin } from '../vite-plugins/patch-rsdw.js';
import { privateDirPlugin } from '../vite-plugins/private-dir.js';
import { ssrLoaderPlugin } from '../vite-plugins/ssr-loader.js';
import { userEntriesPlugin } from '../vite-plugins/user-entries.js';
import { virtualConfigPlugin } from '../vite-plugins/virtual-config.js';

export function rscPlugin(config: Required<Config>): PluginOption {
  const extraPlugins = [...(config.vite?.plugins ?? [])];
  // add react plugin automatically if users didn't include it on their own (e.g. swc, oxc, babel react compiler)
  if (
    !extraPlugins
      .flat()
      .some((p) => p && 'name' in p && p.name.startsWith('vite:react'))
  ) {
    extraPlugins.push(react());
  }

  return [
    ...extraPlugins,
    allowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    ssrLoaderPlugin(), // compile `loadSsrModule` hints
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
