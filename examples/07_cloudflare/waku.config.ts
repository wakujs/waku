import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss() as PluginOption],
    optimizeDeps: {
      exclude: ['sqlite'],
    },
  },
});
