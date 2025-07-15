/// <reference types="vite/client" />
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default fsRouter(
  import.meta.url,
  (file: string) =>
    import.meta.glob('./pages/**/*.{tsx,ts}')[`./pages/${file}`]?.(),
  { pagesDir: 'pages', apiDir: 'api' },
);
