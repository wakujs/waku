import type { Plugin } from 'vite';

export function cloudflarePlugin(): Plugin {
  return {
    name: 'waku:vite-plugins:cloudflare',
    resolveId(source) {
      if (source === 'cloudflare:workers') {
        return { id: source, external: true };
      }
    },
  };
}
