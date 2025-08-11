import { Hono } from 'hono';
import { createApp } from './lib/engine.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';

const app = honoEnhancer(createApp)(new Hono());

export default app.fetch;

export { handleBuild } from './lib/build.js';
