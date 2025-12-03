import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({ distDir }: { distDir: string }) {
  const SERVE_JS = 'serve-bun.js';
  const serveCode = `
import { unstable_serverEntry } from './server/index.js';

Bun.serve({
  fetch: unstable_runFetch.fetch,
});
`;
  writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
}
