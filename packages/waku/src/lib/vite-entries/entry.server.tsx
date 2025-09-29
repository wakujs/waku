import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';

export { serverEntry };

export async function runFetch(env: unknown, req: Request, ...args: never[]) {
  INTERNAL_setAllEnv(env as any);
  return serverEntry.fetch(req, ...args);
}
