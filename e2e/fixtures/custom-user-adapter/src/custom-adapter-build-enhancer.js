import { writeFileSync } from 'node:fs';
import path from 'node:path';

async function postBuild({ distDir, marker }) {
  const summaryPath = path.join(distDir, 'custom-user-adapter-post-build.json');
  writeFileSync(summaryPath, JSON.stringify({ marker }, null, 2));

  const SERVE_JS = 'serve-node.js';
  const serveCode = `
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { INTERNAL_runFetch } from './server/server.js';

const host = process.env.HOST;
const port = process.env.PORT;

function nodeRequestToWebRequest(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  const headers = new Headers(req.headers);
  const method = req.method || 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(req);
  return new Request(url, {
    method,
    headers,
    ...(body ? { body, duplex: 'half' } : {}),
  });
}

async function sendWebResponse(res, webRes) {
  res.statusCode = webRes.status;
  for (const [key, value] of webRes.headers.entries()) {
    res.setHeader(key, value);
  }
  if (!webRes.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(webRes.body), res);
}

const server = createServer(async (req, res) => {
  try {
    const webReq = nodeRequestToWebRequest(req);
    const webRes = await INTERNAL_runFetch(process.env, webReq);
    await sendWebResponse(res, webRes);
  } catch (e) {
    res.statusCode = 500;
    res.end(String(e));
  }
});

server.listen(port ? parseInt(port, 10) : undefined, host || undefined);
`;
  writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
}

export default async function buildEnhancer(build) {
  return async (emitFile, options) => {
    await build(emitFile, options);
    await postBuild(options);
  };
}
