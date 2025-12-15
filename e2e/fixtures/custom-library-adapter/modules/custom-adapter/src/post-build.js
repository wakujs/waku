import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({ distDir, marker }) {
  const indexHtmlPath = path.join(distDir, 'public', 'index.html');
  const indexHtml = readFileSync(indexHtmlPath, 'utf8');
  const summary = {
    marker,
    hasIndexHtml: indexHtml.includes('Hello from custom adapter'),
  };
  const summaryPath = path.join(distDir, 'custom-adapter-post-build.json');
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}
