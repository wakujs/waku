import { INTERNAL_setAllEnv } from '../../server.js';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function runBuild({
  savePlatformData,
}: {
  savePlatformData: () => Promise<void>;
}) {
  INTERNAL_setAllEnv(process.env as any);
  await serverEntry.build();
  await savePlatformData();
  if (serverEntry.postBuild) {
    const [modulePath, ...args] = serverEntry.postBuild;
    const mod = await import(modulePath);
    mod.default(...args);
  }
}
