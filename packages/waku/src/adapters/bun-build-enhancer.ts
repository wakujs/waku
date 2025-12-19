import { writeFileSync } from 'node:fs';
import path from 'node:path';

export type BuildOptions = { distDir: string };

async function postBuild({ distDir }: BuildOptions) {
  const SERVE_JS = 'serve-bun.js';
  const serveCode = `
import { unstable_serverEntry } from './server/index.js';

Bun.serve({
  fetch: unstable_serverEntry.fetch,
});
`;
  writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await build(utils, options);
    await postBuild(options);
  };
}
