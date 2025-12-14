import type { Plugin } from 'vite';

export function patchRsdwPlugin(): Plugin {
  return {
    // rewrite `react-server-dom-webpack` in `waku/minimal/client`
    name: 'waku:vite-plugins:patch-rsdw',
    enforce: 'pre',
    resolveId(source, _importer, _options) {
      if (source === 'react-server-dom-webpack/client') {
        return '\0' + source;
      }
    },
    load(id) {
      if (id === '\0react-server-dom-webpack/client') {
        if (this.environment.name === 'client') {
          return `
              import * as ReactClient from ${JSON.stringify(import.meta.resolve('@vitejs/plugin-rsc/browser'))};
              export default ReactClient;
            `;
        }
        return `export default {}`;
      }
    },
  };
}
