import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    environments: {
      rsc: {
        resolve: {
          external: ['shiki'],
        },
      },
    },
  },
});
