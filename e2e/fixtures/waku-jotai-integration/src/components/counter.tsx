'use client';

import { useTransition } from 'react';
import { atom, useAtom } from 'jotai';
import { unstable_allowServer as allowServer } from 'waku/client';

export const countAtom = allowServer(atom(1));

export const Counter = () => {
  const [count, setCount] = useAtom(countAtom);
  const [isPending, startTransition] = useTransition();
  const inc = () => {
    startTransition(() => {
      setCount((c) => c + 1);
    });
  };
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p data-testid="count">[count={count}]</p>
      <button onClick={inc}>Increment</button> {isPending ? 'Pending...' : ''}
      <h3>This is a client component.</h3>
    </div>
  );
};
