import { writeFileSync } from 'node:fs';
import path from 'node:path';

export type BuildOptions = { distDir: string };

async function postBuild({ distDir }: BuildOptions) {
  const SERVE_JS = 'serve-deno.js';
  const serveCode = `
import { Hono } from 'jsr:@hono/hono';
import { serveStatic } from 'jsr:@hono/hono/deno';

globalThis.__WAKU_DENO_ADAPTER_HONO__ = Hono;
globalThis.__WAKU_DENO_ADAPTER_SERVE_STATIC__ = serveStatic;

const { INTERNAL_runFetch } = await import('./server/server.js');

const env = Deno.env.toObject();
Deno.serve((req, ...args) => INTERNAL_runFetch(env, req, ...args));
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await build(utils, options);
    await postBuild(options);
  };
}
