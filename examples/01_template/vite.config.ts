import tailwindcss from '@tailwindcss/vite';
import waku, { defineConfig } from 'waku/vite-plugins';

// Benefits of vite.config.ts as source of truth:
//
// 1. Functional config - switch based on command/mode
//    (not supported in waku.config.ts)
//
// 2. Waku config lives inline in plugin call
//    (no separate waku.config.ts needed)
//
// 3. Standard Vite plugin pattern
//    (familiar to Vite users)
//
// 4. Vite owns the lifecycle
//    (restart on .env change just works - fixes #1860)

export default defineConfig((env) => ({
  plugins: [
    // User plugins - you control the order
    tailwindcss(),

    // Waku plugin with inline config (previously in waku.config.ts)
    waku({
      // srcDir: 'src',
      // distDir: 'dist',
      // privateDir: 'private',
    }),

    // React plugin is auto-added by waku if not present
    // Uncomment to customize:
    // react({
    //   babel: {
    //     plugins: ['babel-plugin-react-compiler'],
    //   },
    // }),
  ],

  // Example: conditional config based on command
  ...(env.command === 'build' && {
    // build-specific config
  }),
}));
