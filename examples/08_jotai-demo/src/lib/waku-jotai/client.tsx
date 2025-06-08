'use client';

import { useEffect, useRef } from 'react';
import {
  useEnhanceFetchRscInternal_UNSTABLE as useEnhanceFetchRscInternal,
  useRefetch,
} from 'waku/minimal/client';
import { atom, useStore } from 'jotai';
import type { Atom } from 'jotai';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const createAtomValuesAtom = (atoms: Map<Atom<unknown>, string>) =>
  atom(
    (get) =>
      new Map<Atom<unknown>, unknown>(
        Array.from(atoms).map(([a]) => [a, get(a)]),
      ),
  );

const patchRscParams = (
  rscParams: unknown,
  atoms: Map<Atom<unknown>, string>,
  atomValues: Map<Atom<unknown>, unknown>,
) => {
  let newRscParams: Record<string, unknown>;
  if (
    // waku/router convention
    rscParams instanceof URLSearchParams &&
    rscParams.size === 1 &&
    rscParams.has('query')
  ) {
    newRscParams = { query: rscParams.get('query') };
  } else if (isObject(rscParams)) {
    newRscParams = { ...rscParams };
  } else {
    throw new Error('rscParams must be an object');
  }
  const serializedAtomValues = new Map(
    Array.from(atomValues).map(([a, value]) => [atoms.get(a)!, value]),
  );
  newRscParams.jotai_atomValues = serializedAtomValues;
  return newRscParams;
};

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
  const enhanceFetchRscInternal = useEnhanceFetchRscInternal();
  const refetch = useRefetch();
  const prevAtomValues = useRef(new Map<Atom<unknown>, unknown>());
  const atomsMap = useRef(
    new Map<
      string, // rscPath
      Map<Atom<unknown>, string> // accumulated atoms (LIMITATION: increasing only)
    >(),
  );
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    atomsPromise.then((atoms) => {
      if (controller.signal.aborted) {
        return;
      }
      let atomsForRscPath = atomsMap.current.get(rscPath);
      if (!atomsForRscPath) {
        atomsForRscPath = new Map();
        atomsMap.current.set(rscPath, atomsForRscPath);
      }
      atoms.forEach((id, atom) => {
        atomsForRscPath.set(atom, id);
      });
      const atomValuesAtom = createAtomValuesAtom(atoms);
      const callback = (atomValues: Map<Atom<unknown>, unknown>) => {
        prevAtomValues.current = atomValues;
        const newRscParams = patchRscParams(rscParams, atoms, atomValues);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        refetch(rscPath, newRscParams);
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
  useEffect(() => {
    const rscParamsCache = new WeakMap<object, unknown>();
    return enhanceFetchRscInternal(
      (fetchRscInternal) =>
        (
          rscPath: string,
          rscParams: unknown,
          prefetchOnly,
          fetchFn = fetch,
        ) => {
          const atoms = atomsMap.current.get(rscPath);
          if (atoms?.size) {
            const atomValues = store.get(createAtomValuesAtom(atoms));
            prevAtomValues.current = atomValues;
            rscParams =
              rscParamsCache.get(atoms) ||
              patchRscParams(rscParams, atoms, atomValues);
            if (prefetchOnly) {
              rscParamsCache.set(atoms, rscParams);
            } else {
              rscParamsCache.delete(atoms);
            }
          }
          type Elements = Record<string, unknown>;
          const elementsPromise = fetchRscInternal(
            rscPath,
            rscParams,
            prefetchOnly as undefined,
            fetchFn,
          ) as Promise<Elements> | undefined;
          return elementsPromise as never;
        },
    );
  }, [store, enhanceFetchRscInternal]);
  return null;
};
