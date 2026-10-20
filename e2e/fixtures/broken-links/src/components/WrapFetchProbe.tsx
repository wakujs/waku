'use client';

import { useLayoutEffect } from 'react';
import { useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer } from 'waku/minimal/client';

export function WrapFetchProbe() {
  const register = useRegisterRscEnhancer();
  useLayoutEffect(() => {
    const order = new URLSearchParams(window.location.search).get('wrap-fetch');
    if (order === null) {
      return;
    }
    return register(
      (next) => (path, params, options) =>
        next(path, params, {
          ...options,
          fetch: async (input, init) => {
            const response = await options.fetch(input, init);
            return new Response(response.body, response);
          },
        }),
      Number(order),
    );
  }, [register]);
  return null;
}
