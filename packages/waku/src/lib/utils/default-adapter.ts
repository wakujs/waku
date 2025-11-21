export const getDefaultAdapter = () =>
  process.env.VERCEL
    ? 'waku/adapters/vercel'
    : process.env.NETLIFY
      ? 'waku/adapters/netlify'
      : process.env.CLOUDFLARE
        ? 'waku/adapters/cloudflare'
        : 'waku/adapters/node';
