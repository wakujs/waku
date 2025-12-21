import { readFileSync } from 'node:fs';

export const loadReadme = (): string => {
  const content = readFileSync('./private/README.md', 'utf8');
  return content.replace(/\r\n?/g, '\n');
};

export const loadCreatePages = (): string => {
  const file = readFileSync('../../docs/create-pages.mdx', 'utf8');
  return file.replace(/\r\n?/g, '\n');
};
