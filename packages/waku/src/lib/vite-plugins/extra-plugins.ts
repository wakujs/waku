import react from '@vitejs/plugin-react';
import type { PluginOption } from 'vite';
import type { Config } from '../../config.js';

export function extraPlugins(config: Required<Config>): PluginOption {
  const plugins = [...(config.vite?.plugins ?? [])];
  // add react plugin automatically if users didn't include it on their own (e.g. swc, oxc, babel react compiler)
  if (
    !plugins
      .flat()
      .some((p) => p && 'name' in p && p.name.startsWith('vite:react'))
  ) {
    plugins.push(react());
  }
  return plugins;
}
