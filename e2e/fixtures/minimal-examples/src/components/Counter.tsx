'use client';

import { useCallback, useState } from 'react';
import {
  unstable_fetchRsc as fetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
  useRscReloadListener_UNSTABLE as useRscReloadListener,
} from 'waku/minimal/client';

const useRefetch = () => {
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRscReloadListener();
  return useCallback(
    (rscPath: string) => {
      const refetch = () => mergeElements(fetchRsc(rscPath));
      registerRscReloadListener?.(
        () => {
          void refetch();
        },
        { replace: true },
      );
      return refetch();
    },
    [mergeElements, registerRscReloadListener],
  );
};

export function Counter() {
  const [count, setCount] = useState(0);
  const refetch = useRefetch();
  return (
    <div>
      <p data-testid="count">Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button onClick={() => void refetch('refetched')}>Refetch</button>
    </div>
  );
}
