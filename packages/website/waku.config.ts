import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      client: {
        optimizeDeps: {
          include: ['tailwindcss/colors'],
        },
      },
      rsc: {
        optimizeDeps: {
          include: ['next-mdx-remote/rsc'],
        },
      },
    },
  },
});
