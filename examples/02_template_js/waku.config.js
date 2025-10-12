import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
});
