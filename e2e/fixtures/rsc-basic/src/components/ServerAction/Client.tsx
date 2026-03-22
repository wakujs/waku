'use client';

import { useEffect } from 'react';
import { useActions } from 'ai/rsc';

export const ClientActionsConsumer = () => {
  const actions = useActions();
  useEffect(() => {
    (globalThis as any).actions = actions;
  }, [actions]);
  return <div>globalThis.actions: {JSON.stringify(Object.keys(actions))}</div>;
};
