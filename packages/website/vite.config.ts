import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        include: ['tailwindcss/colors'],
      },
      ssr: {
        optimizeDeps: {
          include: ['next-mdx-remote/rsc'],
        },
      },
    };
  }
  return {};
});
