'use client';

import { useEffect, useRef } from 'react';
import { useRefetch } from 'waku/minimal/client';
import { atom, useStore } from 'jotai';
import type { Atom } from 'jotai';

export const SyncAtoms = ({
  atomsPromise,
  rscPath,
  rscParams,
}: {
  atomsPromise: Promise<Map<Atom<unknown>, string>>;
  rscPath: string;
  rscParams: unknown;
}) => {
  const store = useStore();
  const refetch = useRefetch();
  const prevAtomValues = useRef<Map<Atom<unknown>, unknown>>(new Map());
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    atomsPromise.then((atoms) => {
      if (controller.signal.aborted) {
        return;
      }
      const atomValuesAtom = atom(
        (get) =>
          new Map<Atom<unknown>, unknown>(
            Array.from(atoms).map(([a]) => [a, get(a)]),
          ),
      );
      const callback = (atomValues: Map<Atom<unknown>, unknown>) => {
        prevAtomValues.current = atomValues;
        const serializedAtomValues = new Map(
          Array.from(atomValues).map(([a, value]) => [atoms.get(a)!, value]),
        );
        const rscParams = {
          jotai_atomValues: serializedAtomValues,
        };
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        refetch(rscPath, rscParams);
      };
      const unsub = store.sub(atomValuesAtom, () => {
        callback(store.get(atomValuesAtom));
      });
      const atomValues = store.get(atomValuesAtom);
      // HACK check if atom values have already been changed
      if (
        Array.from(atomValues).some(([a, value]) =>
          prevAtomValues.current.has(a)
            ? prevAtomValues.current.get(a) !== value
            : 'init' in a && a.init !== value,
        )
      ) {
        callback(atomValues);
      }
      controller.signal.addEventListener('abort', () => {
        unsub();
      });
    });
    return () => controller.abort();
  }, [store, atomsPromise, refetch, rscPath, rscParams]);
  return null;
};
