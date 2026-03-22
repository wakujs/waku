import { defineConfig } from 'waku/config';
import type { VitePlugin } from 'waku/config';

function buildMode(): VitePlugin {
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
    plugins: [buildMode()],
  },
});
