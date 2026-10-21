import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import type { Unstable_RscEnhancer } from 'waku/minimal/client';
import { Router } from 'waku/router/client';

const enhance: Unstable_RscEnhancer = (next) => (path, params, options) =>
  next(path, params, {
    ...options,
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('X-Bootstrap-Enhancer', 'configured');
      return options.fetch(input, { ...init, headers });
    },
  });

const container =
  new URLSearchParams(window.location.search).get('__container') === 'body'
    ? document.body
    : document;

createRoot(container, defaultRootOptions).render(
  <StrictMode>
    <Router unstable_rscEnhancers={[enhance]} />
  </StrictMode>,
);
