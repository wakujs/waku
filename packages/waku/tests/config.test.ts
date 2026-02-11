import { expectType } from 'ts-expect';
import { expect, test } from 'vitest';
import { type ConfigExport, defineConfig, loadEnv } from '../src/config.js';

// Absolutely meaningless unit and type test examples.
// Only exist to proof that the frameworks are set up correctly.

test('defineConfig with object', () => {
  expect(defineConfig({})).toEqual({});
  expect(defineConfig({ basePath: '/app/' })).toEqual({ basePath: '/app/' });
});

test('defineConfig with callback', () => {
  const fn = () => ({});
  expect(defineConfig(fn)).toBe(fn);
});

test('loadEnv is re-exported from vite', () => {
  expect(typeof loadEnv).toBe('function');
});

// Type tests
expectType<ConfigExport>(defineConfig({}));
expectType<ConfigExport>(defineConfig(() => ({})));
expectType<ConfigExport>(defineConfig(async () => ({})));

// @ts-expect-error This is supposed to verify ts-expect works.
expectType<undefined>(defineConfig({}));
