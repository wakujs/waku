import { existsSync } from 'node:fs';
import path from 'node:path';
import * as vite from 'vite';
import type { Config } from '../../../config.js';
import { resolveConfig } from '../../utils/config.js';
import loadEnv from '../../utils/env.js';
import { combinedPlugins } from '../../vite-plugins/combined-plugins.js';
import { handleServerRestart } from './restart.js';

export async function loadConfig(): Promise<Required<Config>> {
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    config = imported.module.default;
  }
  return resolveConfig(config);
}

export async function startDevServer(
  host: string | undefined,
  port: number,
  config: Required<Config>,
  isRestart?: boolean,
) {
  if (isRestart) {
    // Reload env vars when server restarts using the workaround pattern
    loadEnv();
  }

  const server = await vite.createServer({
    configFile: false,
    plugins: [combinedPlugins(config)],
    server: host ? { host, port } : { port },
  });

  // Override Vite's restart to intercept automatic restarts (.env, tsconfig, etc.)
  server.restart = async () => {
    console.log('Vite server restart intercepted, reloading Waku plugins...');
    await handleServerRestart(host, port, server);
  };

  await server.listen();
  const url =
    server.resolvedUrls?.network?.[0] ?? server.resolvedUrls?.local?.[0];
  console.log(`ready: Listening on ${url}`);
  const watcher = server.watcher;
  watcher.on('change', handleConfigChange);
  watcher.on('unlink', handleConfigChange);
  watcher.on('add', handleConfigChange);

  async function handleConfigChange(changedFile: string) {
    const dirname = path.dirname(changedFile);
    const filename = path.basename(changedFile);
    if (
      dirname === process.cwd() &&
      (filename === 'waku.config.ts' || filename === 'waku.config.js')
    ) {
      console.log(`Waku configuration file changed, restarting server...`);
      await handleServerRestart(host, port, server);
    }
  }

  return server;
}
