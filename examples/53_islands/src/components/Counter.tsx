'use client';

import { useState } from 'react';

export const Counter = () => {
  if (typeof window === 'undefined') {
    throw new Error('Counter must be used in the browser environment.');
  }
  const [count, setCount] = useState(0);
  return (
    <div style={{ border: '3px blue dashed', margin: '1em', padding: '1em' }}>
      <p>Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <h3>This is a client component.</h3>
    </div>
  );
};
