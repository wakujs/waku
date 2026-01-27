import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import waku, { defineConfig } from 'waku/vite-plugins';

// export default defineConfig({
//   plugins: [
//     tailwindcss(),
//     // react({
//     //   babel: {
//     //     plugins: ['babel-plugin-react-compiler'],
//     //   },
//     // }),
//     waku(),
//   ],
// });

export default defineConfig((env) => ({
  // NOTE
  // functional forms allow env.command === 'build' etc.
  // to switch configuration easily.

  plugins: [
    tailwindcss(),
    // TODO: need solution for auto react plugin config from waku plugin
    // react({
    //   babel: {
    //     plugins: ['babel-plugin-react-compiler'],
    //   },
    // }),
    waku({
      // NOTE
      // waku config lives here now
      // privateDir: 'private',
    }),
  ],
}));
