'use client';

import { useEffect, useState } from 'react';
import { useRscReloadListener_UNSTABLE as useRscReloadListener } from 'waku/minimal/client';
import { updateContent } from './ServerPing/actions.js';

type RootName = 'first' | 'second' | 'third';

export const MultipleRootAction = ({ name }: { name: RootName }) => {
  const registerRscReloadListener = useRscReloadListener();
  const [ownsHmr, setOwnsHmr] = useState(false);
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const unregister =
      searchParams.get('descendant-hmr') === name || ownsHmr
        ? registerRscReloadListener?.(
            () => {
              (
                globalThis as typeof globalThis & {
                  __WAKU_TEST_HMR_TARGET__?: RootName;
                }
              ).__WAKU_TEST_HMR_TARGET__ = name;
            },
            { replace: true },
          )
        : undefined;
    const next =
      name === 'first'
        ? 'second'
        : name === 'second' && searchParams.has('three-roots')
          ? 'third'
          : undefined;
    if (next) {
      (
        globalThis as typeof globalThis & {
          __WAKU_MOUNT_ROOT__?: (name: RootName) => void;
        }
      ).__WAKU_MOUNT_ROOT__?.(next);
    }
    return unregister;
  }, [name, ownsHmr, registerRscReloadListener]);
  return (
    <>
      <button onClick={() => updateContent()}>Update content</button>
      <button onClick={() => setOwnsHmr(true)}>
        {ownsHmr ? 'Owns HMR' : 'Own HMR'}
      </button>
    </>
  );
};
