import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import { filePathToFileURL, joinPath } from '../utils/path.js';

export async function INTERNAL_runBuild({
  rootDir,
  savePlatformData,
}: {
  rootDir: string;
  savePlatformData: () => Promise<void>;
}) {
  INTERNAL_setAllEnv(process.env as any);
  await serverEntry.build();
  await savePlatformData();
  if (serverEntry.postBuild) {
    const [modulePath, ...args] = serverEntry.postBuild;
    const moduleId =
      modulePath.startsWith('./') || modulePath.startsWith('../')
        ? filePathToFileURL(joinPath(rootDir, modulePath))
        : modulePath;
    const mod = await import(moduleId);
    mod.default(...args);
  }
}
