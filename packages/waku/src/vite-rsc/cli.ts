import * as vite from 'vite';
import { mainPlugin, type MainPluginOptions } from './plugin.js';
import type { Config } from '../config.js';
import { existsSync } from 'node:fs';

export async function cli(cmd: string, flags: Record<string, any>) {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= cmd === 'dev' ? 'development' : 'production';

  // TODO: reload during dev
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    config = imported.module.default;
  }

  const pluginOptions: MainPluginOptions = {
    flags,
    config: config,
  };

  if (cmd === 'dev') {
    const server = await vite.createServer({
      configFile: false,
      plugins: [mainPlugin(pluginOptions)],
      server: {
        port: parseInt(flags.port || '3000', 10),
      },
    });
    await server.listen();
    const url = server.resolvedUrls!['local'];
    console.log(`ready: Listening on ${url}`);
  }

  if (cmd === 'build') {
    const builder = await vite.createBuilder({
      configFile: false,
      plugins: [mainPlugin(pluginOptions)],
    });
    await builder.buildApp();
  }

  if (cmd === 'start') {
    const server = await vite.preview({
      configFile: false,
      plugins: [mainPlugin(pluginOptions)],
      preview: {
        port: parseInt(flags.port || '8080', 10),
      },
    });
    const url = server.resolvedUrls!['local'];
    console.log(`ready: Listening on ${url}`);
  }
}
