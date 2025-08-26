'use client';

import { useState } from 'react';

export const Counter = () => {
  const [count, setCount] = useState(0);

  const handleIncrement = () => setCount((c) => c + 1);

  return (
    <button data-testid="client-counter" onClick={handleIncrement}>
      Client counter: {count}
    </button>
  );
};
