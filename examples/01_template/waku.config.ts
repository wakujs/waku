import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  basePath: '/custom-base/',
  vite: {
    plugins: [tailwindcss()],
  },
});
