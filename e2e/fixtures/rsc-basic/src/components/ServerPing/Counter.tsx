'use client';

import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';

export type CounterProps = {
  ping: () => Promise<string>;
  increase: (value: number) => Promise<number>;
  wrap: (node: ReactNode) => Promise<ReactNode>;
};

export function Counter({ increase, ping, wrap }: CounterProps) {
  const [pong, setPong] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);
  const [wrapped, setWrapped] = useState<ReactNode>(null);
  return (
    <div>
      <p data-testid="pong">{pong}</p>
      <button
        data-testid="ping"
        onClick={() => {
          ping()
            .then((value) => {
              setPong(value);
            })
            .catch(console.error);
        }}
      >
        ping
      </button>
      <p data-testid="counter">{counter}</p>
      <button
        data-testid="increase"
        onClick={useCallback(() => {
          increase(counter)
            .then((value) => setCounter(value))
            .catch(console.error);
        }, [counter, increase])}
      >
        Increase
      </button>
      <p data-testid="wrapped">{wrapped}</p>
      <button
        data-testid="wrap"
        onClick={() => {
          wrap(<Okay />)
            .then((value) => setWrapped(value))
            .catch(console.error);
        }}
      >
        wrap
      </button>
    </div>
  );
}

function Okay() {
  return <>okay</>;
}
