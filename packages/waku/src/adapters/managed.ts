import { netlifyAdapter } from './netlify.js';
import { nodeAdapter } from './node.js';
import { vercelAdapter } from './vercel.js';

export const managedAdapter = process.env.VERCEL
  ? vercelAdapter
  : process.env.NETLIFY
    ? netlifyAdapter
    : nodeAdapter;
