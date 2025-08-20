import * as vite from 'vite';
import { rscPlugin } from './plugin.js';
import type { Flags, RscPluginOptions } from './plugin.js';
import type { Config } from '../../config.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

async function loadRscPluginOptions(flags: Flags): Promise<RscPluginOptions> {
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    config = imported.module.default;
  }
  return { flags, config };
}

async function startDevServer(flags: { port?: string } & Flags) {
  const rscPluginOptions = await loadRscPluginOptions(flags);
  const server = await vite.createServer({
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

  async function handleConfigChange(changedFile: string) {
    const dirname = path.dirname(changedFile);
    const filename = path.basename(changedFile);
    if (
      dirname === process.cwd() &&
      (filename === 'waku.config.ts' || filename === 'waku.config.js')
    ) {
      console.log(`Waku configuration file changed, restarting server...`);
      await server.close();
      await startDevServer(flags);
    }
  }
}

export async function cli(
  cmd: 'dev' | 'build' | 'start',
  flags: { port?: string } & Flags,
) {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  process.env.NODE_ENV ??= cmd === 'dev' ? 'development' : 'production';

  if (cmd === 'dev') {
    await startDevServer(flags);
  } else if (cmd === 'build') {
    const rscPluginOptions = await loadRscPluginOptions(flags);
    const builder = await vite.createBuilder({
      configFile: false,
      plugins: [rscPlugin(rscPluginOptions)],
    });
    await builder.buildApp();
  } else if (cmd === 'start') {
    const rscPluginOptions = await loadRscPluginOptions(flags);
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
