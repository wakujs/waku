import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { processRequest } from '../vite-rsc/handler.js';

export const fetch = serverEntry.createFetch({
  processRequest,
  config,
  isBuild,
});

export { processBuild } from '../vite-rsc/build.js';
