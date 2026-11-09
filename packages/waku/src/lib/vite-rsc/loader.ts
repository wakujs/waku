import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';
import * as vite from 'vite';
import type { Config } from '../../config.js';
import { resolveConfig } from '../utils-build/config.js';

let dotEnvKeys: string[] = [];

export function loadDotEnv() {
  for (const key of dotEnvKeys) {
    delete process.env[key];
  }
  const existingKeys = new Set(Object.keys(process.env));
  dotenv.config({ path: ['.env.local', '.env'], quiet: true });
  dotEnvKeys = Object.keys(process.env).filter((key) => !existingKeys.has(key));
}

export async function loadConfig(): Promise<Required<Config>> {
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    config = imported.module.default;
  }
  return resolveConfig(config);
}
