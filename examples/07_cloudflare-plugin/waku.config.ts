import { defineConfig } from 'waku/config';
import { cloudflare } from '@cloudflare/vite-plugin';
import { ssgPolyfillPlugin } from './ssg-polyfill';

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
                // TODO: waku can do this by default
                outDir: './dist/rsc/ssr',
              },
            };
          }
        },
      },
      ssgPolyfillPlugin(),
    ],
    environments: {
      rsc: {
        optimizeDeps: {
          // TODO
          exclude: ['hono'],
        },
      },
    },
    // empty buildApp to disable cloudflare's buildApp
    // https://github.com/cloudflare/workers-sdk/blob/19e2aab1d68594c7289d0aa16474544919fd5b9b/packages/vite-plugin-cloudflare/src/index.ts#L183-L186
    builder: {
      buildApp: async () => {},
    },
  },
});
