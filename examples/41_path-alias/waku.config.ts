import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [tsconfigPaths()],
  },
});
