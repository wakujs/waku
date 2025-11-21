// This file won't be used actually as it will be replaced by the build process.
// See src/lib/vite-rsc/plugin.ts (createVirtualAdapterPlugin)

import cloudflareAdapter from './cloudflare.js';
import netlifyAdapter from './netlify.js';
import nodeAdapter from './node.js';
import vercelAdapter from './vercel.js';

export default
  ? vercelAdapter
  : process.env.NETLIFY
      ? netlifyAdapter
      : process.env.CLOUDFLARE
    ? cloudflareAdapter
    : nodeAdapter;
