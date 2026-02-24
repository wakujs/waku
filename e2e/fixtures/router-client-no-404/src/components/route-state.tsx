'use client';

import { useRouter } from 'waku';

export function RouteState() {
  const router = useRouter();
  return (
    <>
      <p data-testid="route-path">{router.path}</p>
      <p data-testid="route-query">{router.query}</p>
      <p data-testid="route-hash">{router.hash}</p>
    </>
  );
}

export function PushMissingButton() {
  const router = useRouter();
  const push = router.push as unknown as (to: string) => Promise<void>;
  return (
    <button
      data-testid="go-missing"
      onClick={() => {
        void push('/missing');
      }}
      type="button"
    >
      Go missing
    </button>
  );
}
