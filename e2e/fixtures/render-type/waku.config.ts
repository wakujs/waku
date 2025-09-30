import type { Plugin } from 'vite';
import { defineConfig } from 'waku/config';

function buildMode(): Plugin {
  return {
    name: 'build-mode',
    load() {
      (globalThis as any).__WAKU_IS_BUILD__ = this.environment.mode === 'build';
    },
  };
}

export default defineConfig({
  vite: {
    plugins: [buildMode()],
  },
});
