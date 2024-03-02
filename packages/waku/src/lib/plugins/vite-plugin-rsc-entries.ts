import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

export function rscEntriesPlugin(opts: {
  entriesFile: string;
  moduleMap: Record<string, string>;
}): Plugin {
  let codeToAdd = `
export function loadModule(id) {
  const moduleMap = ${JSON.stringify(opts.moduleMap)};
  const file = moduleMap[id];
  if (!file) {
    throw new Error('Cannot find module: ' + id);
  }
  return import(file);
}
`;
  const file = path.resolve(CONFIG_FILE);
  console.log('============', CONFIG_FILE, file, existsSync(file));
  if (existsSync(file)) {
    codeToAdd += `
export const configPromise = import('${path.relative(path.dirname(opts.entriesFile), file)}').then((m) => m.default);
`;
  } else {
    codeToAdd += `
export const configPromise = Promise.resolve({});
`;
  }
  return {
    name: 'rsc-entries-plugin',
    transform(code, id) {
      if (id === opts.entriesFile) {
        return code + codeToAdd;
      }
    },
  };
}
