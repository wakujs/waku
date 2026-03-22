'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

export const Hydrated = () => {
  const ok = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return <div>Hydrated: {String(ok)}</div>;
};
