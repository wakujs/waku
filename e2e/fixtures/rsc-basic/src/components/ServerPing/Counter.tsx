'use client';

import { useCallback, useState, Suspense } from 'react';
import type { ReactNode } from 'react';

import { getData } from './actions.js';

export type CounterProps = {
  ping: () => Promise<string>;
  increase: (value: number) => Promise<number>;
  wrap: (node: ReactNode) => Promise<ReactNode>;
};

export function Counter({ increase, ping, wrap }: CounterProps) {
  const [pong, setPong] = useState<string | null>(null);
  const [counter, setCounter] = useState(0);
  const [wrapped, setWrapped] = useState<ReactNode>(null);
  const [showServerData, setShowServerData] = useState(false);
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
      <button
        data-testid="show-server-data"
        onClick={() => setShowServerData(true)}
      >
        Show Server Data
      </button>
      {showServerData && <Suspense fallback="Loading...">{getData()}</Suspense>}
    </div>
  );
}

function Okay() {
  return <>okay</>;
}
