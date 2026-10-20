'use client';

import { useLayoutEffect } from 'react';
import { useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer } from 'waku/minimal/client';

declare global {
  interface Window {
    __rscCache?: { hits: number; misses: number };
  }
}

export function CachedRscProbe() {
  const register = useRegisterRscEnhancer();
  useLayoutEffect(() => {
    if (!new URLSearchParams(window.location.search).has('cache-rsc')) {
      return;
    }
    const stats = { hits: 0, misses: 0 };
    window.__rscCache = stats;
    let cached: Promise<Readonly<Record<string | symbol, unknown>>> | undefined;
    return register((next) => (path, params, options) => {
      if (options.type !== 'rsc' || path !== 'R/redirect-query') {
        return next(path, params, options);
      }
      if (cached) {
        stats.hits++;
      } else {
        stats.misses++;
        cached = next(path, params, options).then(({ elements }) => elements);
      }
      return cached.then((elements) => ({ elements }));
    });
  }, [register]);
  return null;
}
