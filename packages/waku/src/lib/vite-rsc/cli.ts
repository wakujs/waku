import * as vite from 'vite';
import { rscPlugin, type RscPluginOptions } from './plugin.js';
import type { Config } from '../../config.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

export async function cli(cmd: string, flags: Record<string, any>) {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= cmd === 'dev' ? 'development' : 'production';

  async function loadMainPluginOptions(): Promise<RscPluginOptions> {
    let config: Config | undefined;
    if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
      const imported = await vite.runnerImport<{ default: Config }>(
        '/waku.config',
      );
      config = imported.module.default;
    }
    return { flags, config };
  }

  if (cmd === 'dev') {
    let server: vite.ViteDevServer;
    await startDevServer();

    async function startDevServer() {
      const rscPluginOptions = await loadMainPluginOptions();
      server = await vite.createServer({
        configFile: false,
        plugins: [rscPlugin(rscPluginOptions)],
        server: {
          port: parseInt(flags.port || '3000', 10),
        },
      });
      await server.listen();
      const url = server.resolvedUrls!['local'];
      console.log(`ready: Listening on ${url}`);
      const watcher = server.watcher;
      watcher.on('change', handleConfigChange);
      watcher.on('unlink', handleConfigChange);
      watcher.on('add', handleConfigChange);
    }

    async function handleConfigChange(changedFile: string) {
      const dirname = path.dirname(changedFile);
      const filename = path.basename(changedFile);
      if (
        dirname === process.cwd() &&
        (filename === 'waku.config.ts' || filename === 'waku.config.js')
      ) {
        console.log(`Waku configuration file changed, restarting server...`);
        await server.close();
        await startDevServer();
      }
    }
  }

  if (cmd === 'build') {
    const rscPluginOptions = await loadMainPluginOptions();
    const builder = await vite.createBuilder({
      configFile: false,
      plugins: [rscPlugin(rscPluginOptions)],
    });
    await builder.buildApp();
  }

  if (cmd === 'start') {
    const rscPluginOptions = await loadMainPluginOptions();
    const server = await vite.preview({
      configFile: false,
      plugins: [rscPlugin(rscPluginOptions)],
      preview: {
        port: parseInt(flags.port || '8080', 10),
      },
    });
    const url = server.resolvedUrls!['local'];
    console.log(`ready: Listening on ${url}`);
  }
}
