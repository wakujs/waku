import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { joinPath, extname } from '../utils/path.js';
import {
  existsSync,
  mkdir,
  writeFile,
  createWriteStream,
} from '../utils/node-fs.js';
import { DIST_PUBLIC } from './constants.js';
import type { ConfigDev } from '../config.js';

const createTaskRunner = (limit: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const errors: unknown[] = [];
  const scheduleTask = async (task: () => Promise<void>) => {
    if (running >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running++;
    try {
      await task();
    } catch (err) {
      errors.push(err);
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
  const runTask = (task: () => Promise<void>) => {
    scheduleTask(task).catch(() => {});
  };
  const waitForTasks = async () => {
    if (running > 0) {
      await new Promise<void>((resolve) => waiting.push(resolve));
      await waitForTasks();
    }
    if (errors.length > 0) {
      console.error('Errors occurred during running tasks:', errors);
      throw errors[0];
    }
  };
  return { runTask, waitForTasks };
};
const WRITE_FILE_BATCH_SIZE = 2500;
const { runTask, waitForTasks } = createTaskRunner(WRITE_FILE_BATCH_SIZE);

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export { waitForTasks };

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export const emitStaticFile = (
  rootDir: string,
  config: Pick<ConfigDev, 'distDir'>,
  pathname: string,
  body: Promise<ReadableStream> | string,
) => {
  const destFile = joinPath(
    rootDir,
    config.distDir,
    DIST_PUBLIC,
    extname(pathname)
      ? pathname
      : pathname === '/404'
        ? '404.html' // HACK special treatment for 404, better way?
        : pathname + '/index.html',
  );
  // In partial mode, skip if the file already exists.
  if (existsSync(destFile)) {
    return;
  }
  runTask(async () => {
    await mkdir(joinPath(destFile, '..'), { recursive: true });
    if (typeof body === 'string') {
      await writeFile(destFile, body);
    } else {
      await pipeline(
        Readable.fromWeb((await body) as never),
        createWriteStream(destFile),
      );
    }
  });
};
