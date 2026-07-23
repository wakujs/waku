import { readFileSync, readdirSync } from 'node:fs';

export const loadReadme = (): string => {
  const content = readFileSync('../../README.md', 'utf8');
  return content.replace(/\r\n?/g, '\n');
};

export const loadCreatePages = (): string => {
  const file = readFileSync('../../docs/create-pages.mdx', 'utf8');
  return file.replace(/\r\n?/g, '\n');
};

export const loadGuides = (): string => {
  const folder = '../../docs/guides';
  const fileNames = readdirSync(folder, {
    recursive: true,
    encoding: 'utf8',
  })
    .filter((fileName) => fileName.endsWith('.mdx'))
    .sort();

  return fileNames
    .map((fileName) =>
      readFileSync(`${folder}/${fileName}`, 'utf8').replace(/\r\n?/g, '\n'),
    )
    .join('\n');
};
