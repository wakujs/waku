/// <reference types="waku/types" />
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default fsRouter(
  import.meta.glob('/src/pages/**/*.{tsx,ts}', { base: '/src/pages' }),
  { apiDir: 'api', slicesDir: '_slices' },
);
