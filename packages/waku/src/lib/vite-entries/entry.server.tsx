import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export const fetch = serverEntry.createFetch({
  handleRequest: serverEntry.handleRequest,
  config,
  isBuild,
});

export { processBuild } from '../vite-rsc/build.js';
