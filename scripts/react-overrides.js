import assert from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';

const reactVersion = process.argv[2];
assert(reactVersion, 'React version is required as the first argument');

const file = 'pnpm-workspace.yaml';
const content = readFileSync(file, 'utf-8');
const newContent = content.replace(
  'overrides:',
  `\
overrides:
  react: "${reactVersion}"
  react-dom: "${reactVersion}"
  react-server-dom-webpack: "${reactVersion}"
`,
);
writeFileSync(file, newContent);
