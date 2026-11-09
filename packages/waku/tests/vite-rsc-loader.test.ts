import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { loadDotEnv } from '../src/lib/vite-rsc/loader.js';

const cwd = process.cwd();

afterEach(() => {
  process.chdir(cwd);
  delete process.env.WAKU_TEST_EDITED;
  delete process.env.WAKU_TEST_REMOVED;
  vi.unstubAllEnvs();
});

test('reloading .env applies edits without overriding the shell', () => {
  process.chdir(mkdtempSync(path.join(tmpdir(), 'waku-dotenv-')));
  vi.stubEnv('WAKU_TEST_SHELL', 'shell');
  writeFileSync(
    '.env',
    'WAKU_TEST_EDITED=one\nWAKU_TEST_REMOVED=x\nWAKU_TEST_SHELL=file\n',
  );
  loadDotEnv();
  expect(process.env.WAKU_TEST_EDITED).toBe('one');

  writeFileSync('.env', 'WAKU_TEST_EDITED=two\nWAKU_TEST_SHELL=file\n');
  loadDotEnv();

  expect(process.env.WAKU_TEST_EDITED).toBe('two');
  expect(process.env.WAKU_TEST_REMOVED).toBeUndefined();
  expect(process.env.WAKU_TEST_SHELL).toBe('shell');
});
