import { getEnv } from 'waku/server';
import fs from 'node:fs';

export default function Test({ title }: { title: string }) {
  fs.mkdirSync('dist/e2e/render', { recursive: true });
  fs.writeFileSync(`dist/e2e/render/${title}.txt`, new Date().toISOString());

  return <div data-testid="title">{title}</div>;
}

export async function getConfig() {
  return {
    render: 'static',
    staticPaths: getEnv('PAGES')?.split(',') || [],
  };
}
