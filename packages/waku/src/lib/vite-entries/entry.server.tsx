import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { processRequest } from '../vite-rsc/handler.js';
import { INTERNAL_setAllEnv } from '../../server.js';
import { createApp } from '../hono/engine.js';

INTERNAL_setAllEnv(process.env as any);

export const { fetch } = (serverEntry.createApp || createApp)({
  processRequest,
  config,
  isBuild,
});

export { processBuild } from '../vite-rsc/build.js';
