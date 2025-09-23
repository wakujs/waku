import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist/.tmp', { recursive: true, force: true });
mkdirSync('dist/.tmp/custom', { recursive: true });
cpSync('dist/public', 'dist/.tmp/custom/base', { recursive: true });
