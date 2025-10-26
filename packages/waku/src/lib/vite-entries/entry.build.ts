import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import { filePathToFileURL } from '../utils/path.js';

const WIN32_PATH_REGEXP = /^[a-zA-Z]:\//;

export async function INTERNAL_runBuild({
  savePlatformData,
}: {
  savePlatformData: () => Promise<void>;
}) {
  INTERNAL_setAllEnv(process.env as any);
  await serverEntry.build();
  await savePlatformData();
  if (serverEntry.postBuild) {
    const [modulePath, ...args] = serverEntry.postBuild;
    const moduleId = modulePath.match(WIN32_PATH_REGEXP)
      ? filePathToFileURL('/' + modulePath)
      : modulePath.startsWith('/')
        ? filePathToFileURL(modulePath)
        : modulePath;
    const mod = await import(moduleId);
    mod.default(...args);
  }
}
