import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';
import nitro from '@hiogawa/vite-plugin-nitro';

// prevent waku's automatic --with-vercel build
delete process.env.VERCEL;

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      nitro({
        server: {
          environmentName: 'rsc',
        },
        config: {
          preset: 'vercel-static',
          vercel: {
            config: {
              // https://vercel.com/docs/build-output-api/configuration#routing-rule-example
              routes: [
                {
                  src: '/discord',
                  status: 308,
                  headers: {
                    Location: 'https://discord.gg/MrQdmzd',
                  },
                },
                {
                  src: '/RSC/(.*)',
                  headers: {
                    'X-Robots-Tag': 'noindex',
                  },
                },
              ] as any, // TODO: nitro type issue?
            },
          },
        },
      }),
    ],
    environments: {
      rsc: {
        resolve: {
          external: ['shiki'],
        },
      },
    },
  },
});
