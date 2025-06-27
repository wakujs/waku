import * as vite from 'vite';
import waku, { type WakuPluginOptions } from './plugin.js';
import type { Config } from '../config.js';

export async function cli(cmd: string, flags: Record<string, any>) {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= cmd === 'dev' ? 'development' : 'production';

  let wakuConfig: Config | undefined;
  try {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    wakuConfig = imported.module.default;
  } catch (e) {
    // ignore errors when waku.config doesn't exist
    if (
      !(
        e instanceof Error &&
        e.message ===
          'Failed to load url /waku.config (resolved id: /waku.config). Does the file exist?'
      )
    ) {
      throw e;
    }
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
    server.printUrls();
    server.bindCLIShortcuts();
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
    server.printUrls();
    server.bindCLIShortcuts();
  }
}
