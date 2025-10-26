import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';
import { defineConfig } from 'waku/config';

function buildMode(): PluginOption {
  return {
    name: 'build-mode',
    load() {
      // FIXME this hack seems fragile.
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
