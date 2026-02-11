import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';
import * as vite from 'vite';
import type { Command, Config, ConfigExport } from '../../config.js';
import { resolveConfig } from '../utils/config.js';

export function loadDotenv() {
  dotenv.config({ path: ['.env.local', '.env'], quiet: true });
}

export async function loadConfig(
  cmd: Command,
  mode: string,
): Promise<Required<Config>> {
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: ConfigExport }>(
      '/waku.config',
    );
    const configExport = imported.module.default;
    config =
      typeof configExport === 'function'
        ? await configExport({ command: cmd, mode })
        : configExport;
  }
  return resolveConfig(config);
}

export function overrideNodeEnv(nodeEnv: 'development' | 'production') {
  // set NODE_ENV before runnerImport https://github.com/vitejs/vite/issues/20299
  if (process.env.NODE_ENV && process.env.NODE_ENV !== nodeEnv) {
    console.warn(
      `Warning: NODE_ENV is set to '${process.env.NODE_ENV}', but overriding it to '${nodeEnv}'.`,
    );
  }
  process.env.NODE_ENV = nodeEnv;
}
