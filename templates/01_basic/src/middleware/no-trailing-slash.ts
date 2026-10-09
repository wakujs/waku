import { trimTrailingSlash } from 'hono/trailing-slash';

// Prerendered pages are served before middleware in production, so this does
// not redirect their URLs: https://waku.gg/guides/redirect-maps
export default () => trimTrailingSlash({ alwaysRedirect: true });

// Usage of appendTrailingSlash
/*
import { appendTrailingSlash } from 'hono/trailing-slash';

export default () =>
  appendTrailingSlash({
    alwaysRedirect: true,
    skip: (path) => /\.\w+$/.test(path),
  });
*/
