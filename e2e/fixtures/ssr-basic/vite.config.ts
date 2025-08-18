import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        exclude: ['@ai-sdk/rsc'],
      },
    };
  }
  return {};
});
