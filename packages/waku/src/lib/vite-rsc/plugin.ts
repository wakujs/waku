import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import type { PluginOption } from 'vite';
import type { Config } from '../../config.js';
import { getDefaultAdapter } from '../utils/default-adapter.js';
import { allowServerPlugin } from '../vite-plugins/allow-server.js';
import { buildMetadataPlugin } from '../vite-plugins/build-metadata.js';
import { defaultAdapterPlugin } from '../vite-plugins/default-adapter.js';
import { fallbackHtmlPlugin } from '../vite-plugins/fallback-html.js';
import { fsRouterTypegenPlugin } from '../vite-plugins/fs-router-typegen.js';
import { mainPlugin } from '../vite-plugins/main.js';
import { notFoundPlugin } from '../vite-plugins/not-found.js';
import { patchRsdwPlugin } from '../vite-plugins/patch-rsdw.js';
import { pathMacroPlugin } from '../vite-plugins/path-macro.js';
import { privateDirPlugin } from '../vite-plugins/private-dir.js';
import { userEntriesPlugin } from '../vite-plugins/user-entries.js';
import { virtualConfigPlugin } from '../vite-plugins/virtual-config.js';

export type RscPluginOptions = {
  config?: Config | undefined;
};

export function rscPlugin(rscPluginOptions?: RscPluginOptions): PluginOption {
  const config: Required<Config> = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    privateDir: 'private',
    rscBase: 'RSC',
    unstable_adapter: getDefaultAdapter(),
    vite: undefined,
    ...rscPluginOptions?.config,
  };
  // ensure trailing slash
  if (!config.basePath.endsWith('/')) {
    throw new Error('basePath must end with /');
  }

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
    rsc({
      serverHandler: false,
      keepUseCientProxy: true,
      useBuildAppHook: true,
      clientChunks: (meta) => meta.serverChunk,
    }),
    mainPlugin(config),
    userEntriesPlugin(config.srcDir),
    virtualConfigPlugin(config),
    defaultAdapterPlugin(config.unstable_adapter),
    notFoundPlugin(),
    pathMacroPlugin(),
    patchRsdwPlugin(),
    buildMetadataPlugin(config),
    privateDirPlugin(config.privateDir),
    fallbackHtmlPlugin(),
    fsRouterTypegenPlugin({ srcDir: config.srcDir }),
  ];
}
