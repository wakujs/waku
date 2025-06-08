'use client';

import { useEffect } from 'react';
import { useRouter } from 'waku/router/client';

export const RoutingHandler = () => {
  const router = useRouter();
  useEffect(() => {
    const onStart = () => {
      console.log('Route change started');
    };
    const onComplete = () => {
      console.log('Route change completed');
    };
    router.unstable_events.on('start', onStart);
    router.unstable_events.on('complete', onComplete);
    return () => {
      router.unstable_events.off('start', onStart);
      router.unstable_events.off('complete', onComplete);
    };
  });
  return null;
};
