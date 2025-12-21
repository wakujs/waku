import type { Plugin } from 'vite';
import type { Config } from '../../config.js';

export function virtualConfigPlugin(config: Required<Config>): Plugin {
  const configModule = 'virtual:vite-rsc-waku/config';
  return {
    name: 'waku:vite-plugins:virtual-config',
    resolveId(source, _importer, _options) {
      return source === configModule ? '\0' + configModule : undefined;
    },
    load(id) {
      if (id === '\0' + configModule) {
        return `
        export const config = ${JSON.stringify({ ...config, vite: undefined })};
        export const isBuild = ${JSON.stringify(this.environment.mode === 'build')};
      `;
      }
    },
  };
}
