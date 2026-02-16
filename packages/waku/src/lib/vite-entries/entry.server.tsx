import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';

export { serverEntry as unstable_serverEntry };

export async function INTERNAL_runFetch(
  env: Readonly<Record<string, string>>,
  req: Request,
  ...args: any[]
) {
  INTERNAL_setAllEnv(env);
  return serverEntry.fetch(req, ...args);
}

export default serverEntry.defaultExport;
