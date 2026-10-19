'use client';

import { use, useState } from 'react';
import { useRouter } from 'waku';

let finish = () => {};
const ready = new Promise<void>((resolve) => {
  finish = resolve;
});

export function PendingPage() {
  use(ready);
  return <p>Client ready</p>;
}

export function PendingNavigation() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          await router.push('/suspended');
          setAccepted(true);
        }}
      >
        Start suspended navigation
      </button>
      <output data-testid="accepted">{String(accepted)}</output>
      <button type="button" onClick={() => finish()}>
        Finish suspended navigation
      </button>
    </>
  );
}
