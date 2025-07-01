'use client';

import { use, useEffect } from 'react';
import type { ReactNode } from 'react';

import {
  useElementsPromise_UNSTABLE as useElementsPromise,
  useRefetch,
  Slot,
} from 'waku/minimal/client';

const getSliceSlotId = (id: string) => 'slice:' + id;

export function Slice({
  id,
  fetchArgs,
  children,
  fallback,
}: {
  id: string;
  fetchArgs?: readonly [rscPath: string, rscParams?: unknown];
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const hasFetchArgs = !!fetchArgs;
  const [rscPath, rscParams] = hasFetchArgs ? fetchArgs : [''];
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const hasSlice = slotId in elements;
  useEffect(() => {
    if (!hasSlice && hasFetchArgs) {
      refetch(rscPath, rscParams).catch((e) => {
        console.error('Failed to refetch:', e);
      });
    }
  }, [refetch, hasFetchArgs, rscPath, rscParams, hasSlice]);
  if (!hasSlice) {
    return fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}
