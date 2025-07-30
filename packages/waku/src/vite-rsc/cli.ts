import * as vite from 'vite';
import waku, { type WakuPluginOptions } from './plugin.js';
import type { Config } from '../config.js';
import { existsSync } from 'node:fs';

export async function cli(cmd: string, flags: Record<string, any>) {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= cmd === 'dev' ? 'development' : 'production';

  // TODO: reload during dev
  let wakuConfig: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    wakuConfig = imported.module.default;
  }

  const wakuPluginOptions: WakuPluginOptions = {
    flags,
    config: wakuConfig,
  };

  if (cmd === 'dev') {
    const server = await vite.createServer({
      configFile: false,
      plugins: [waku(wakuPluginOptions)],
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
      plugins: [waku(wakuPluginOptions)],
    });
    await builder.buildApp();
  }

  if (cmd === 'start') {
    const server = await vite.preview({
      configFile: false,
      plugins: [waku(wakuPluginOptions)],
      preview: {
        port: parseInt(flags.port || '8080', 10),
      },
    });
    const url = server.resolvedUrls!['local'];
    console.log(`ready: Listening on ${url}`);
  }
}
