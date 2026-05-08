import rsc from '@vitejs/plugin-rsc';
import type { PluginOption } from 'vite';
import type { Config } from '../../config.js';
import { adapterAliasPlugin } from './adapter-alias.js';
import { allowServerPlugin } from './allow-server.js';
import { appEntriesPlugin } from './app-entries.js';
import { buildMetadataPlugin } from './build-metadata.js';
import { environmentsPlugin } from './environments.js';
import { extraPlugins } from './extra-plugins.js';
import { fsRouterTypegenPlugin } from './fs-router-typegen.js';
import { htmlShellPlugin } from './html-shell.js';
import { notFoundPlugin } from './not-found.js';
import { patchRsdwPlugin } from './patch-rsdw.js';
import { privateDirPlugin } from './private-dir.js';
import { rscDevtoolsPlugin } from './rsc-devtools.js';
import { staticBuildPlugin } from './static-build.js';
import { virtualConfigPlugin } from './virtual-config.js';

export function combinedPlugins(config: Required<Config>): PluginOption {
  return [
    extraPlugins(config),
    allowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    rsc({
      serverHandler: false,
      keepUseCientProxy: true,
      useBuildAppHook: true,
      clientChunks: (meta) => meta.serverChunk,
    }),
    rscDevtoolsPlugin(),
    environmentsPlugin(config),
    appEntriesPlugin(config),
    virtualConfigPlugin(config),
    adapterAliasPlugin(config),
    notFoundPlugin(),
    patchRsdwPlugin(),
    buildMetadataPlugin(config),
    staticBuildPlugin(config),
    privateDirPlugin(config),
    htmlShellPlugin(),
    fsRouterTypegenPlugin(config),
  ];
}
