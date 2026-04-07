import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
    optimizeDeps: {
      // technically false-positive warning but it ensures a safe behavior
      // https://github.com/vitejs/vite-plugin-react/issues/759
      exclude: ['waku-jotai'],
    },
  },
});
