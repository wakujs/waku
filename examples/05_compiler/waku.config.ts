import { defineConfig } from 'waku/config';
import react from '@vitejs/plugin-react';

const ReactCompilerConfig = {};

const getConfig = () => ({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
      },
    }),
  ],
});

export default defineConfig({
  unstable_viteConfigs: {
    'dev-main': getConfig,
    'build-client': getConfig,
  },
  vite: {
    plugins: [
      // cf. https://github.com/vitejs/vite-plugin-react/pull/537
      react({ babel: { plugins: ['babel-plugin-react-compiler'] } }).map(
        (p) =>
          ({
            ...p,
            applyToEnvironment: (e: any) => e.name === 'client',
          }) as any,
      ),
    ],
  },
});
