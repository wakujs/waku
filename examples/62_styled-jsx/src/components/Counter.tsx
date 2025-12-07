'use client';

import { useState } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
      { /* eslint-disable-next-line react/no-unknown-property */ }
      <style jsx>{`
        button {
          border: 1px solid teal;
          padding: 0.5rem 1rem;
          background: transparent;
          cursor: pointer;
        }

        button:hover {
          background: rgba(0, 128, 128, 0.1);
        }
      `}</style>
    </>
  );
};
