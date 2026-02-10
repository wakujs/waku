import * as vite from 'vite';
import type { Config } from '../../config.js';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig, loadEnv, overrideNodeEnv } from './loader.js';

loadEnv();

export async function runBuild() {
  overrideNodeEnv('production');
  const config = await loadConfig();
  const builder = await vite.createBuilder({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  globalThis.__WAKU_START_PREVIEW_SERVER__ = () =>
    startPreviewServerImpl(config);
  await builder.buildApp();
}

async function startPreviewServerImpl(config: Required<Config>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = await vite.preview({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  return {
    baseUrl: server.resolvedUrls!.local[0]!,
    close: () => server.close(),
  };
}
