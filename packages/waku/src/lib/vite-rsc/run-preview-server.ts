import * as vite from 'vite';
import type { PreviewServer } from './preview.js';

export async function runPreviewServer(
  plugins: vite.PluginOption,
): Promise<PreviewServer> {
  const server = await vite.preview({ configFile: false, plugins: [plugins] });
  return {
    baseUrl: server.resolvedUrls!.local[0]!,
    middlewares: {
      use: (fn) => server.middlewares.use(fn),
    },
    close: () => server.close(),
  };
}
