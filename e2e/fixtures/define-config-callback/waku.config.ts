import { defineConfig } from 'waku/config';

export default defineConfig(({ command, mode }) => ({
  vite: {
    define: {
      'import.meta.env.WAKU_TEST_COMMAND': JSON.stringify(command),
      'import.meta.env.WAKU_TEST_MODE': JSON.stringify(mode),
    },
  },
}));
