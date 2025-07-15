'use client';

import { useState } from 'react';
import { clientStyle } from '../client.css';

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount((c) => c + 1)} className={clientStyle}>
      Client Style: {count} (orange)
    </button>
  );
};
