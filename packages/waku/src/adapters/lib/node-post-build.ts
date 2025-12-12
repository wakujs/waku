import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({ distDir }: { distDir: string }) {
  const SERVE_JS = 'serve-node.js';
  const serveCode = `
import { INTERNAL_runFetch, unstable_serverEntry } from './server/index.js';

const { serve } = unstable_serverEntry;

const host = process.env.HOST;
const port = process.env.PORT;

serve({
  fetch: (req, ...args) => INTERNAL_runFetch(process.env, req, ...args),
  ...(host ? { hostname: host } : {}),
  ...(port ? { port: parseInt(port, 10) } : {}),
});
`;
  writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
}
