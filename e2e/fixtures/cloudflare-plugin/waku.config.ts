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
                  // override Waku's default entry
                  input: {
                    index: './src/index.ts',
                  },
                  // will be fixed by https://github.com/cloudflare/workers-sdk/issues/10213
                  preserveEntrySignatures: 'strict',
                },
              },
            };
          }
          if (name === 'ssr') {
            return {
              // resolve process.env.NODE_ENV branch in react code
              keepProcessEnv: false,
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
  },
});
