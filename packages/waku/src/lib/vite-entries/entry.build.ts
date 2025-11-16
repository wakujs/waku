import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import type { Unstable_EmitFile } from '../types.js';
import { filePathToFileURL, joinPath } from '../utils/path.js';

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
    const moduleId = modulePath.startsWith('./')
      ? filePathToFileURL(joinPath(rootDir, modulePath))
      : modulePath;
    const mod = await import(moduleId);
    mod.default(...args);
  }
}
