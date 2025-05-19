'use client';

import { useState, useTransition } from 'react';
import { Link, useRouter } from 'waku/router/client';

import { jump, jumpToNestedBaz } from './funcs.js';

export const Counter = () => {
  const { path } = useRouter();
  const [count, setCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [jumpFinished, setJumpFinished] = useState(false);
  if (jumpFinished) {
    throw new Error('Jump finished but should not reach here');
  }
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
      <span>path: {path}</span>
      <p>
        <Link to="/">Go to Home</Link>
      </p>
      <p>
        <button onClick={() => startTransition(jump)}>
          Jump to random page{isPending && '...'}
        </button>
      </p>
      <p>
        <button
          onClick={() =>
            startTransition(async () => {
              await jumpToNestedBaz();
              startTransition(() => {
                setJumpFinished(true);
              });
            })
          }
        >
          Jump with setState
        </button>
      </p>
    </div>
  );
};
