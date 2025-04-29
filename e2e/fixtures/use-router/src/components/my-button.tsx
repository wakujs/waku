'use client';

import { useRouter } from 'waku';

export const MyButton = () => {
  const router = useRouter();
  router.unstable_onRouteChangeStart(() => {
    console.log('Route change started');
  });
  router.unstable_onRouteChangeComplete(() => {
    console.log('Route change completed');
  });
  return (
    <button onClick={() => router.push(`/static`)}>
      Static router.push button
    </button>
  );
};
