export const getDefaultAdapter = () =>
  process.env.VERCEL
    ? 'waku/adapters/vercel'
    : process.env.NETLIFY
      ? 'waku/adapters/netlify'
      : 'waku/adapters/node';
