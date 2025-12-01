import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import * as serverEntryExports from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';

export const unstable_serverEntryExports =
  serverEntryExports as typeof serverEntryExports & {
    [someOtherExport: string]: unknown;
  };

export async function INTERNAL_runFetch(
  env: Readonly<Record<string, string>>,
  req: Request,
  ...args: any[]
) {
  INTERNAL_setAllEnv(env);
  return serverEntry.fetch(req, ...args);
}
