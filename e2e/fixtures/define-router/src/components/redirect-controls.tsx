'use client';

import { useRouter } from 'waku/router/client';

export function RedirectControls() {
  const router = useRouter();
  return (
    <>
      <button onClick={() => void router.push('/absolute-redirect')}>
        Push absolute redirect
      </button>
      <button onClick={() => void router.replace('/absolute-redirect')}>
        Replace absolute redirect
      </button>
    </>
  );
}
