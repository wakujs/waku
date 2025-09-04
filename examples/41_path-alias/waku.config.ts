import { defineConfig } from 'waku/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  vite: {
    plugins: [tsconfigPaths()],
  },
});
