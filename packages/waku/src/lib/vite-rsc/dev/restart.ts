import type * as vite from 'vite';
import { loadConfig, startDevServer } from './dev.js';

/**
 * Track if a restart is currently in flight to prevent concurrent restarts
 */
let restartInFlight = false;

async function withRestartLock<T>(
  operation: () => Promise<T>,
): Promise<T | undefined> {
  if (restartInFlight) {
    console.log('Server restart already in progress, skipping...');
    return undefined;
  }

  restartInFlight = true;
  try {
    return await operation();
  } finally {
    restartInFlight = false;
  }
}

export async function handleServerRestart(
  host: string | undefined,
  port: number,
  server: vite.ViteDevServer,
) {
  await withRestartLock(async () => {
    console.log('Restarting server with fresh plugin configuration...');

    const previousUrls = server.resolvedUrls;

    await server.close();

    const freshConfig = await loadConfig();

    const newServer = await startDevServer(host, port, freshConfig, true);

    if (previousUrls) {
      server.resolvedUrls = newServer.resolvedUrls;
    }
  });
}
