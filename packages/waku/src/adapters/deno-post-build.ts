import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({
  distDir,
  DIST_PUBLIC,
}: {
  distDir: string;
  DIST_PUBLIC: string;
}) {
  const SERVE_JS = 'serve-deno.js';
  const serveCode = `
import { Hono } from 'jsr:@hono/hono';
import { serveStatic } from 'jsr:@hono/hono/deno';

globalThis.__WAKU_DENO_ADAPTER_ENV__ = Deno.env.toObject();
globalThis.__WAKU_DENO_ADAPTER_HONO__ = Hono;
globalThis.__WAKU_DENO_ADAPTER_SERVE_STATIC__ = serveStatic;
globalThis.__WAKU_DENO_ADAPTER_NOT_FOUND_FN__ = async (c) => {
  const file = ${JSON.stringify(distDir + '/' + DIST_PUBLIC + '/404.html')};
  try {
    const info = await Deno.stat(file);
    if (info.isFile) {
      c.header('Content-Type', 'text/html; charset=utf-8');
      return c.body(await Deno.readFile(file), 404);
    }
  } catch {}
  return c.text('404 Not Found', 404);
};

import { runFetch } from './server/index.js';

Deno.serve(runFetch);
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
}
