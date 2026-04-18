import { expect, test } from 'vitest';
import { getManagedServerEntry } from '../src/lib/utils/managed.js';

test('getManagedServerEntry excludes test and spec files from middleware glob', () => {
  const entry = getManagedServerEntry('src');

  expect(entry).toContain('!/src/middleware/*.{test,spec}.');
});
