'use client';

import { useEffect } from 'react';
import { useRouter } from 'waku';

export const MyButton = () => {
  const router = useRouter();
  useEffect(() => {
    const onStart = () => {
      console.log('[router event] Route change started');
    };
    const onComplete = () => {
      console.log('[router event] Route change completed');
    };
    router.unstable_events.on('start', onStart);
    router.unstable_events.on('complete', onComplete);
    return () => {
      router.unstable_events.off('start', onStart);
      router.unstable_events.off('complete', onComplete);
    };
  });
  return (
    <button onClick={() => router.push(`/static`)}>
      Static router.push button
    </button>
  );
};
