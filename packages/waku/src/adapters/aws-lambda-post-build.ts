import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({ distDir }: { distDir: string }) {
  const SERVE_JS = 'serve-aws-lambda.js';
  const serveCode = `
import { INTERNAL_runFetch } from './server/index.js';

const handle = globalThis.__WAKU_AWS_LAMBDA_HANDLE__;

export const handler = handle({
  fetch: (req, ...args) => INTERNAL_runFetch(process.env, req, ...args),
});
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
  writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
}
