import { readFileSync } from 'node:fs';
import { getReadmePath } from './paths';

export const loadReadme = (): string => {
  const file = readFileSync(getReadmePath(), 'utf8');
  return file;
};
