'use client';

import { useCallback } from 'react';
import { useRouter } from 'waku/router/client';

export const RoutingHandler = () => {
  const { unstable_onRouteChangeComplete, unstable_onRouteChangeStart } =
    useRouter();
  unstable_onRouteChangeStart(
    useCallback(() => {
      console.log('onRouteChangeStart');
    }, []),
  );
  unstable_onRouteChangeComplete(() => {
    console.log('onRouteChangeComplete');
  });
  return null;
};
