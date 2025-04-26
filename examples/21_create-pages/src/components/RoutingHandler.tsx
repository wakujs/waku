'use client';

import { useEffect } from 'react';
import { useRouter } from 'waku/router/client';

export const RoutingHandler = () => {
  const { unstable_onRouteChangeComplete, unstable_onRouteChangeStart } =
    useRouter();
  useEffect(() => {
    unstable_onRouteChangeStart((...args) => {
      console.log('onRouteChangeStart', args);
    });
    unstable_onRouteChangeComplete((...args) => {
      console.log('onRouteChangeComplete', args);
    });
  }, [unstable_onRouteChangeComplete, unstable_onRouteChangeStart]);
  return null;
};
