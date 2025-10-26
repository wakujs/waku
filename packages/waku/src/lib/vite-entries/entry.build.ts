import { pathToFileURL } from 'node:url';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';

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
    const mod = await import(
      modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath
    );
    mod.default(...args);
  }
}
