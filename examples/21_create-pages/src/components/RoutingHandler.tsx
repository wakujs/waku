'use client';

import { useRouter } from 'waku/router/client';

export const RoutingHandler = () => {
  const { unstable_onRouteChangeComplete, unstable_onRouteChangeStart } =
    useRouter();
  unstable_onRouteChangeStart((...args) => {
    console.log('onRouteChangeStart', args);
  });
  unstable_onRouteChangeComplete((...args) => {
    console.log('onRouteChangeComplete', args);
  });
  return null;
};
