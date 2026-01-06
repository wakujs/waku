import { readFile } from 'node:fs/promises';

export const GET = async () => {
  const text = await readFile('./private/hi.txt', 'utf-8');
  return new Response(text);
};
