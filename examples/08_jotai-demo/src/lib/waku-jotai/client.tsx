'use client';

import { useEffect, useRef } from 'react';
import { useRefetch } from 'waku/minimal/client';
import { atom, useStore } from 'jotai';
import type { Atom } from 'jotai';

// waku/router/client internals
const ROUTE_PREFIX = 'R';
const encodeRoutePath = (path: string): string => {
  if (!path.startsWith('/')) {
    throw new Error('Path must start with `/`: ' + path);
  }
  if (path === '/') {
    return ROUTE_PREFIX + '/_root';
  }
  if (path.endsWith('/')) {
    throw new Error('Path must not end with `/`: ' + path);
  }
  return ROUTE_PREFIX + path;
};
const normalizeRoutePath = (path: string) => {
  for (const suffix of ['/', '/index.html']) {
    if (path.endsWith(suffix)) {
      return path.slice(0, -suffix.length) || '/';
    }
  }
  return path;
};

const createRscPathAndRscParams = (
  _dummy: string,
  rscParams: {
    jotai_atomValues: Map<string, unknown>;
  },
): [string, unknown] => {
  const { pathname, searchParams } = new URL(window.location.href);
  const rscPath = encodeRoutePath(normalizeRoutePath(pathname));
  (rscParams as unknown as { query: string }).query = searchParams.toString();
  return [rscPath, rscParams];
};

const defaultCreateRscPathAndRscParams = (
  rscPath: string,
  rscParams: {
    jotai_atomValues: Map<string, unknown>;
  },
): [string, unknown] => [rscPath, rscParams];

export const BaseSyncAtoms = ({
  atomsPromise,
  rscPath = '',
  createRscPathAndRscParams = defaultCreateRscPathAndRscParams,
}: {
  atomsPromise: Promise<Map<Atom<unknown>, string>>;
  rscPath?: string;
  createRscPathAndRscParams?: typeof defaultCreateRscPathAndRscParams;
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
        refetch(...createRscPathAndRscParams(rscPath, rscParams));
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
  }, [store, atomsPromise, refetch, rscPath, createRscPathAndRscParams]);
  return null;
};

export const SyncAtoms = ({
  atomsPromise,
}: {
  atomsPromise: Promise<Map<Atom<unknown>, string>>;
}) => (
  <BaseSyncAtoms
    atomsPromise={atomsPromise}
    rscPath={''}
    createRscPathAndRscParams={createRscPathAndRscParams}
  />
);
