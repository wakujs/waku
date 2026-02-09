import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vite from 'vite';
import { combinedPlugins } from '../vite-plugins/combined-plugins.js';
import { loadConfig, startDevServer } from './dev.js';

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
