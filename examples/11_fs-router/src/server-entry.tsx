/// <reference types="vite/client" />
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default fsRouter(
  import.meta.glob('/src/pages/**/*.tsx', { base: "/src/pages" }),
  { apiDir: 'api' },
)
