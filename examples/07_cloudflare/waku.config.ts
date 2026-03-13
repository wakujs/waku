import { cloudflare } from '@cloudflare/vite-plugin';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      rsc: {
        optimizeDeps: {
          include: ['hono/tiny'],
        },
        build: {
          rollupOptions: {
            platform: 'neutral',
          } as never,
        },
      },
      ssr: {
        optimizeDeps: {
          include: ['waku > rsc-html-stream/server'],
        },
        build: {
          rollupOptions: {
            platform: 'neutral',
          } as never,
        },
      },
    },
    plugins: [
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        inspectorPort: false,
      }),
    ],
  },
});
