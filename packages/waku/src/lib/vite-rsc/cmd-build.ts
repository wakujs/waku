import * as vite from 'vite';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig, loadDotenv, overrideNodeEnv } from './loader.js';

loadDotenv();

export async function runBuild() {
  overrideNodeEnv('production');
  const mode = 'production';
  const config = await loadConfig('build', mode);
  const builder = await vite.createBuilder({
    configFile: false,
    plugins: [combinedPlugins(config)],
  });
  await builder.buildApp();
}
