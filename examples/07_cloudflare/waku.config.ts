import type { PluginOption } from 'vite';
import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

function buildMode(): PluginOption {
  return {
    name: 'build-mode',
    load() {
      (globalThis as any).__WAKU_IS_BUILD__ = this.environment.mode === 'build';
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [tailwindcss(), buildMode()],
    optimizeDeps: {
      exclude: ['sqlite'],
    },
  },
});
