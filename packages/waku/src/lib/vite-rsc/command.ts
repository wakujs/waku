import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import rsc from '@vitejs/plugin-rsc';
import * as vite from 'vite';
import type { Config } from '../../config.js';
import { resolveConfig } from '../utils/config.js';
import { allowServerPlugin } from '../vite-plugins/allow-server.js';
import { buildMetadataPlugin } from '../vite-plugins/build-metadata.js';
import { cloudflarePlugin } from '../vite-plugins/cloudflare.js';
import { defaultAdapterPlugin } from '../vite-plugins/default-adapter.js';
import { extraPlugins } from '../vite-plugins/extra-plugins.js';
import { fallbackHtmlPlugin } from '../vite-plugins/fallback-html.js';
import { fsRouterTypegenPlugin } from '../vite-plugins/fs-router-typegen.js';
import { mainPlugin } from '../vite-plugins/main.js';
import { notFoundPlugin } from '../vite-plugins/not-found.js';
import { patchRsdwPlugin } from '../vite-plugins/patch-rsdw.js';
import { privateDirPlugin } from '../vite-plugins/private-dir.js';
import { userEntriesPlugin } from '../vite-plugins/user-entries.js';
import { virtualConfigPlugin } from '../vite-plugins/virtual-config.js';

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

function rscPlugins(config: Required<Config>) {
  return [
    extraPlugins(config),
    allowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    cloudflarePlugin(),
    rsc({
      serverHandler: false,
      keepUseCientProxy: true,
      useBuildAppHook: true,
      clientChunks: (meta) => meta.serverChunk,
    }),
    mainPlugin(config),
    userEntriesPlugin(config),
    virtualConfigPlugin(config),
    defaultAdapterPlugin(config),
    notFoundPlugin(),
    patchRsdwPlugin(),
    buildMetadataPlugin(config),
    privateDirPlugin(config),
    fallbackHtmlPlugin(),
    fsRouterTypegenPlugin(config),
  ];
}

async function startDevServer(
  host: string | undefined,
  port: number,
  config: Required<Config>,
) {
  const server = await vite.createServer({
    configFile: false,
    plugins: [rscPlugins(config)],
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
      plugins: [rscPlugins(config)],
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
