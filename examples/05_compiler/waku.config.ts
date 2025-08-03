import { defineConfig } from 'waku/config';
import react from '@vitejs/plugin-react';

const ReactCompilerConfig = {};

export default defineConfig({
  vite: {
    plugins: [
      // cf. https://github.com/vitejs/vite-plugin-react/pull/537
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler', ReactCompilerConfig],
        },
      }).map(
        (p) =>
          ({
            ...p,
            applyToEnvironment: (e: any) => e.name === 'client',
          }) as any,
      ),
    ],
  },
});
