import { writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({ distDir }: { distDir: string }) {
  const SERVE_JS = 'serve-aws-lambda.js';
  const serveCode = `
import { serverEntry } from './server/index.js';

export const handler = serverEntry.handler;
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
  writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
}
