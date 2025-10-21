import type { Unstable_CreateServerEntryAdapter as CreateServerEntryAdapter } from '../lib/types.js';

const adapterModule = process.env.VERCEL
  ? 'waku/adapters/vercel'
  : process.env.NETLIFY
    ? 'waku/adapters/netlify'
    : 'waku/adapters/node';

const adapter: ReturnType<CreateServerEntryAdapter> = (
  await import(adapterModule)
).default;

export default adapter;
