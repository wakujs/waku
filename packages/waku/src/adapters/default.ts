const adapterModule = process.env.VERCEL
  ? 'waku/adapters/vercel'
  : process.env.NETLIFY
    ? 'waku/adapters/netlify'
    : 'waku/adapters/node';

export default (await import(adapterModule)).default;
