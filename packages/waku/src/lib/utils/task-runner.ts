import { joinPath } from './path.js';

export const createTaskRunner = (limit: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const errors: unknown[] = [];
  const scheduleTask = async (task: () => Promise<void>) => {
    if (running >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running++;
    task()
      .catch((err) => {
        errors.push(err);
      })
      .finally(() => {
        running--;
        waiting.shift()?.();
      });
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
  return { scheduleTask, waitForTasks };
};

// FIXME Not happy with this hack. There should be a better way.
const DO_NOT_BUNDLE = '';

export const emitFileInTask = async (
  scheduleTaskForRender: (task: () => Promise<void>) => Promise<void>,
  scheduleTaskForWrite: (task: () => Promise<void>) => Promise<void>,
  rootDir: string,
  filePath: string,
  renderBody: () => Promise<ReadableStream | string>,
) => {
  const [
    { Readable },
    { pipeline },
    { existsSync, createWriteStream },
    { mkdir, writeFile },
  ] = await Promise.all([
    import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:stream'),
    import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:stream/promises'),
    import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:fs'),
    import(/* @vite-ignore */ DO_NOT_BUNDLE + 'node:fs/promises'),
  ]);
  const destFile = joinPath(rootDir, filePath);
  if (!destFile.startsWith(rootDir)) {
    throw new Error('Invalid filePath: ' + filePath);
  }
  // In partial mode, skip if the file already exists.
  if (existsSync(destFile)) {
    return;
  }
  await scheduleTaskForRender(async () => {
    const body = await renderBody();
    await scheduleTaskForWrite(async () => {
      await mkdir(joinPath(destFile, '..'), { recursive: true });
      if (typeof body === 'string') {
        await writeFile(destFile, body);
      } else {
        await pipeline(
          Readable.fromWeb(body as never),
          createWriteStream(destFile),
        );
      }
    });
  });
};
