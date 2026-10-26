import { describe, expect, test } from 'vitest';
import { createWeakPromise } from '../src/lib/utils-server/weak-promise.js';

describe('createWeakPromise', () => {
  test.each(['', 'value', '$value', '雪'])(
    'notifies synchronously and preserves the first string %j',
    async (first) => {
      const { promise, resolve } = createWeakPromise();
      const seen: (string | undefined)[] = [];
      const result = promise.then((value) => {
        seen.push(value);
        return value;
      });
      resolve(first);
      resolve('ignored');
      promise.then((value) => seen.push(value));
      expect(seen).toEqual([first, first]);
      await expect(result).resolves.toBe(first);
      await expect(Promise.resolve(promise)).resolves.toBe(first);
    },
  );

  test('handler failures reject the chained promise', async () => {
    const { promise, resolve } = createWeakPromise();
    const result = promise.then(() => {
      throw new Error('handler failed');
    });
    resolve('value');
    await expect(result).rejects.toThrow('handler failed');
  });
});
