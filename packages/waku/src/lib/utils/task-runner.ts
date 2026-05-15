export const createTaskRunner = (limit: number) => {
  let running = 0;
  const waiting: (() => void)[] = [];
  const runTask = <T>(task: () => Promise<T>): Promise<T> =>
    (async () => {
      while (running >= limit) {
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      running++;
      try {
        return await task();
      } finally {
        running--;
        waiting.shift()?.();
      }
    })();
  return { runTask };
};
