import { Hono } from 'hono';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import { createApp as defaultCreateApp } from '../hono/engine.js';
import { notFoundMiddleware, staticMiddleware } from '../hono/middleware.js';
import { processRequest } from '../vite-rsc/handler.js';

INTERNAL_setAllEnv(process.env as any);

const args = { processRequest, config, isBuild };
const createApp = serverEntry.createApp || defaultCreateApp;

const app = new Hono();
app.use(`${config.basePath}*`, staticMiddleware(args));
const newApp = createApp(args, app);
app.use(notFoundMiddleware(args));

export const fetch = newApp.fetch;
