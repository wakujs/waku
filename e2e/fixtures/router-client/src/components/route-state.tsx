'use client';

import { useRouter } from 'waku';

export function RouteState() {
  const router = useRouter();
  return (
    <>
      <p data-testid="route-path">{router.path}</p>
      <p data-testid="route-query">{router.query}</p>
      <p data-testid="route-hash">{router.hash}</p>
      <p>
        <button
          data-testid="router-push-query-only"
          onClick={() => router.push('/start?from=query-only')}
          type="button"
        >
          router.push query only
        </button>
      </p>
      <p>
        <button
          data-testid="router-push-hash-target"
          onClick={() => router.push('/start#scroll-target')}
          type="button"
        >
          router.push hash target
        </button>
      </p>
      <p>
        <button
          data-testid="router-push-hash-missing"
          onClick={() => router.push('/start#missing')}
          type="button"
        >
          router.push hash missing
        </button>
      </p>
      <p>
        <button
          data-testid="router-push-next"
          onClick={() => router.push('/next?x=1')}
          type="button"
        >
          router.push next
        </button>
      </p>
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
