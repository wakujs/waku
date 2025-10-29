import netlifyAdapter from './netlify.js';
import nodeAdapter from './node.js';
import vercelAdapter from './vercel.js';

export default process.env.VERCEL
  ? vercelAdapter
  : process.env.NETLIFY
    ? netlifyAdapter
    : nodeAdapter;
