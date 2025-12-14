export const getDefaultAdapter = () =>
  process.env.VERCEL
    ? 'waku/adapters/vercel'
    : process.env.NETLIFY
      ? 'waku/adapters/netlify'
      : process.env.WORKERS_CI
        ? 'waku/adapters/cloudflare'
        : 'waku/adapters/node';
