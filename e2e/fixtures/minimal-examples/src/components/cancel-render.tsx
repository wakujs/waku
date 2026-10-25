'use client';

import { Suspense } from 'react';
import {
  Slot_UNSTABLE as Slot,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';

export const CancelRender = () => {
  const merge = useMergeElements();
  const fetchRsc = useFetchRsc();
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
        <button
          onClick={async () => {
            await merge(await fetchRsc('cancel-render-update'));
          }}
        >
          Cancel update
        </button>
        <button
          onClick={async () => {
            await merge(await fetchRsc('cancel-request'));
          }}
        >
          Cancel request
        </button>
      </body>
    </html>
  );
};
