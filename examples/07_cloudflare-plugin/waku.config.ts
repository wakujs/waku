import { defineConfig } from 'waku/config';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  vite: {
    plugins: [
      cloudflare({
        persistState: true,
        viteEnvironment: {
          name: 'rsc',
        },
      }),
      {
        name: 'waku-override',
        apply: 'build',
        enforce: 'post',
        configEnvironment(name, _config, _env) {
          if (name === 'rsc') {
            return {
              build: {
                rollupOptions: {
                  input: {
                    worker: './src/worker.ts',
                    index: './src/worker.ts',
                  },
                  preserveEntrySignatures: 'exports-only',
                },
              },
            };
          }
          if (name === 'ssr') {
            return {
              keepProcessEnv: false,
              build: {
                // build `ssr` inside `rsc` directory so that
                // wrangler can deploy self-contained `dist/rsc`
                outDir: './dist/rsc/ssr',
              },
            };
          }
        },
      },
    ],
    environments: {
      rsc: {
        optimizeDeps: {
          // TODO
          exclude: ['hono'],
        },
      },
    },
    // https://github.com/vitejs/vite-plugin-react/pull/780
    builder: {
      buildApp: async () => {},
    },
  },
});
