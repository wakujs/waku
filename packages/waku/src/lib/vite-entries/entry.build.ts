import { createRequire } from 'node:module';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import type { Unstable_EmitFile } from '../types.js';
import { filePathToFileURL, joinPath } from '../utils/path.js';

function resolveModuleId(moduleId: string, rootDir: string) {
  if (moduleId.startsWith('file://')) {
    return moduleId;
  }
  if (moduleId.startsWith('./')) {
    return filePathToFileURL(joinPath(rootDir, moduleId));
  }
  const require = createRequire(joinPath(rootDir, 'DUMMY.js'));
  const resolved = require.resolve(moduleId);
  return filePathToFileURL(resolved);
}

export async function INTERNAL_runBuild({
  rootDir,
  emitFile,
}: {
  rootDir: string;
  emitFile: Unstable_EmitFile;
}) {
  INTERNAL_setAllEnv(process.env as any);
  await serverEntry.build(emitFile);
  if (serverEntry.postBuild) {
    const [modulePath, ...args] = serverEntry.postBuild;
    const moduleId = resolveModuleId(modulePath, rootDir);
    const mod = await import(moduleId);
    mod.default(...args);
  }
}
