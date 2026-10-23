'use client';

import { Suspense } from 'react';
import {
  Slot_UNSTABLE as Slot,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';

export const CancelRender = () => {
  const merge = useMergeElements();
  return (
    <html>
      <body>
        <h1>Cancellation shell</h1>
        <Suspense fallback={<p>Cancelled slot fallback</p>}>
          <Slot id="cancelled" />
        </Suspense>
        <Slot id="sibling" />
        <button
          onClick={async () => {
            await merge(Promise.resolve({ cancelled: <p>Recovered slot</p> }));
          }}
        >
          Recover slot
        </button>
      </body>
    </html>
  );
};
