import { useState } from 'react';
import type { ReactNode } from 'react';
import { greet } from '../functions/greet';

export function Counter() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<ReactNode>(null);
  return (
    <section>
      <p data-testid="count">Count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      <button onClick={async () => setMessage(await greet())}>Greet</button>
      {message}
    </section>
  );
}
