import { expect, test } from 'vitest';
import { getManagedServerEntry } from '../src/lib/utils/managed.js';

test('getManagedServerEntry excludes test and spec files from middleware glob', async () => {
  const entry = await getManagedServerEntry({
    rootDir: process.cwd(),
    srcDir: 'src',
    mode: 'dev',
  });

  expect(entry).toContain('!/src/middleware/*.{test,spec}.');
});
