import * as vite from 'vite';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig } from './loader.js';

export async function startPreviewServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const config = await loadConfig();
  const server = await vite.preview({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  return {
    baseUrl: server.resolvedUrls!.local[0]!,
    close: () => server.close(),
  };
}
