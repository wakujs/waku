'use client';

import { use, useEffect, useState, version } from 'react';
import { version as domVersion } from 'react-dom';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
} from 'waku/minimal/client';
import { INTENT_ID, RUNTIME_ID, WEAK_APP_ID } from '../weak-promise-protocol';

export const WeakPromiseProbe = () => {
  const elements = use(useElementsPromise());
  const [intent, setIntent] = useState('none');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.resolve(
      elements[INTENT_ID] as PromiseLike<string | undefined>,
    ).then(
      (value) => {
        if (active && value !== undefined) {
          setIntent(value);
        }
      },
      (reason: unknown) => {
        if (active) {
          setError(String(reason));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [elements]);
  return (
    <>
      <p data-testid="weak-intent">{intent}</p>
      <p data-testid="weak-error">{error}</p>
      <button
        data-testid="weak-counter"
        ref={(button) => {
          button?.setAttribute('data-hydrated', 'true');
        }}
        onClick={() => setCount((value) => value + 1)}
      >
        {count}
      </button>
      <pre data-testid="weak-runtime">
        {JSON.stringify({
          server: elements[RUNTIME_ID],
          client: { react: version, reactDom: domVersion },
        })}
      </pre>
    </>
  );
};

export const WeakPromiseRoot = () => {
  return (
    <Root initialRscPath="weak">
      <Slot id={WEAK_APP_ID} />
    </Root>
  );
};
