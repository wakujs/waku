import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';

export async function fetch(req: Request) {
  INTERNAL_setAllEnv(process.env as any);
  return serverEntry.fetch(req);
}
