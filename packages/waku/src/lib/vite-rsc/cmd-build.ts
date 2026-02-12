import * as vite from 'vite';
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
  await builder.buildApp();
}
