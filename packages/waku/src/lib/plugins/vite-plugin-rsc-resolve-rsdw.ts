import type { Plugin } from 'vite';

export function rscResolveRsdwPlugin(): Plugin {
  return {
    name: 'rsc-resolve-rsdw-plugin',
    enforce: 'pre',
    async resolveId(id) {
      console.error('Resolving ID:', id);
      if (id === 'react-server-dom-webpack/server.edge') {
        const resolved = await this.resolve(id);
        return resolved?.id;
      }
    },
  };
}
