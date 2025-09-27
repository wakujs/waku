import { INTERNAL_setAllEnv } from '../../server.js';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function runBuild() {
  INTERNAL_setAllEnv(process.env as any);
  await serverEntry.build();
}
