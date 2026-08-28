'use client';

import { useCallback } from 'react';
import {
  unstable_fetchRsc as fetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
  useRscReloadListener_UNSTABLE as useRscReloadListener,
} from 'waku/minimal/client';

const useRefetch = () => {
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRscReloadListener();
  return useCallback(
    (rscPath: string, rscParams?: unknown) => {
      const refetch = () => mergeElements(fetchRsc(rscPath, rscParams));
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

export function MinimalRefetch() {
  const refetch = useRefetch();
  return (
    <button
      type="button"
      data-testid="minimal-refetch"
      onClick={() =>
        void refetch('R/widget', new URLSearchParams({ query: '' }))
      }
    >
      refetch
    </button>
  );
}
