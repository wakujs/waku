import * as vite from 'vite';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig, loadDotEnv } from './loader.js';
import { runPreviewServer } from './run-preview-server.js';

loadDotEnv();

export async function runBuild() {
  // set NODE_ENV before vite.runnerImport: https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= 'production';
  const config = await loadConfig();
  const builder = await vite.createBuilder({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  globalThis.__WAKU_START_PREVIEW_SERVER__ = () =>
    runPreviewServer(combinedPlugins(config));
  await builder.buildApp();
}
