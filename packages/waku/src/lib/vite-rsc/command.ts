import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vite from 'vite';
import type { Config } from '../../config.js';
import { resolveConfig } from '../utils/config.js';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';

// TODO: async function combinedPlugins(): PluginOption { ...}
// then load Config inside not from argument?
// then basically, we can do
// vite.createServer({})
// no, inline config { plugins: [ ...] } need to be avoided? so we need to avoid configFile: false?
// other way to pass config is through dummy configFile?
// that was actually initial shape on my @vitejs/plugin-rsc integration.
// what sveltekit/react-router does, is that let user have vite.config.ts and add explicitly
// sveltekit/react-router plugin there, so vite can take over everything as usual.

async function loadConfig(): Promise<Required<Config>> {
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    config = imported.module.default;
  }
  return resolveConfig(config);
}

async function startDevServer(
  host: string | undefined,
  port: number,
  config: Required<Config>,
) {
  const server = await vite.createServer({
    configFile: false,
    plugins: [combinedPlugins(config)],
    server: host ? { host, port } : { port },
  });
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
      await server.close();
      const config = await loadConfig();
      await startDevServer(host, port, config);
    }
  }
}

export async function runCommand(
  cmd: 'dev' | 'build' | 'start',
  flags: { host?: string; port?: string },
) {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  const nodeEnv = cmd === 'dev' ? 'development' : 'production';
  if (process.env.NODE_ENV && process.env.NODE_ENV !== nodeEnv) {
    console.warn(
      `Warning: NODE_ENV is set to '${process.env.NODE_ENV}', but overriding it to '${nodeEnv}'.`,
    );
  }
  process.env.NODE_ENV = nodeEnv;

  const config = await loadConfig();

  if (cmd === 'dev') {
    const host = flags.host;
    const port = parseInt(flags.port || '3000', 10);
    await startDevServer(host, port, config);
  } else if (cmd === 'build') {
    const builder = await vite.createBuilder({
      configFile: false,
      plugins: [combinedPlugins(config)],
    });
    await builder.buildApp();
  } else if (cmd === 'start') {
    const host = flags.host;
    const port = await getFreePort(parseInt(flags.port || '8080', 10));
    const distDir = config?.distDir ?? 'dist';
    const serveFileUrl = pathToFileURL(
      path.resolve(distDir, 'serve-node.js'),
    ).href;
    if (host) {
      process.env.HOST = host;
    }
    process.env.PORT = String(port);
    await import(serveFileUrl);
    console.log(`ready: Listening on http://${host || 'localhost'}:${port}/`);
  }
}

async function getFreePort(startPort: number): Promise<number> {
  for (let port = startPort; ; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const srv = net
          .createServer()
          .once('error', reject)
          .once('listening', () => srv.close(() => resolve()))
          .listen(port);
      });
      return port;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
        throw err;
      }
    }
  }
}
