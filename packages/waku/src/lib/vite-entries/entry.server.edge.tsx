import { Hono } from 'hono';
import { createHonoHandler } from '../vite-rsc/engine.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';

function createApp(app: Hono) {
  app.use(createHonoHandler());
  return app;
}

const app = honoEnhancer(createApp)(new Hono());

export default async function handler(request: Request): Promise<Response> {
  return app.fetch(request);
}

export { handleBuild } from '../vite-rsc/build.js';
