import { cache } from 'react';
import type { ReactNode } from 'react';
import type { Atom } from 'jotai/vanilla';
import { INTERNAL_buildStoreRev1 as buildStore } from 'jotai/vanilla/internals';
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
} from 'jotai/vanilla/internals';
import {
  unstable_getRscPath as getRscPath,
  unstable_getRscParams as getRscParams,
} from 'waku/router/server';

import { SyncAtoms } from './client';

const CLIENT_REFERENCE_TAG = Symbol.for('react.client.reference');

type ClientReferenceId = string;

const getClientReferenceId = (a: Atom<unknown>) => {
  if ((a as any)['$$typeof'] === CLIENT_REFERENCE_TAG) {
    const id: ClientReferenceId = (a as any)['$$id'];
    return id;
  }
  return null;
};

type Store = ReturnType<typeof buildStore>;

const createStorePromise = cache(() => {
  let resolveStore: ((store: Store) => void) | undefined;
  const storePromise = new Promise<Store>((resolve) => {
    resolveStore = resolve;
  });
  return { resolveStore: resolveStore!, storePromise };
});

export const getStore = () => {
  const { storePromise } = createStorePromise();
  return storePromise;
};

const ensureMap = (value: unknown) =>
  value instanceof Map ? value : new Map();

const prepareStore = (atomValues: unknown) => {
  const clientAtomValues = ensureMap(atomValues);
  const clientAtoms = new Map<Atom<unknown>, ClientReferenceId>();
  const atomStateMap = new Map<Atom<unknown>, AtomState>();
  const patchedAtomStateMap: AtomStateMap = {
    get: (a) => atomStateMap.get(a),
    set: (a, s) => {
      const id = getClientReferenceId(a);
      if (id) {
        clientAtoms.set(a, id);
        if (clientAtomValues.has(id)) {
          s.v = clientAtomValues.get(id) as never;
        }
      }
      atomStateMap.set(a, s);
    },
  };
  const store = buildStore(patchedAtomStateMap);
  const { resolveStore } = createStorePromise();
  resolveStore(store);
  let resolveAtoms: (m: Map<Atom<unknown>, string>) => void;
  const atomsPromise = new Promise<Map<Atom<unknown>, string>>((r) => {
    resolveAtoms = r;
  });
  setTimeout(async () => {
    let size: number;
    do {
      size = atomStateMap.size;
      await Promise.all(Array.from(atomStateMap.values()).map((s) => s.v));
    } while (size !== atomStateMap.size);
    resolveAtoms(clientAtoms);
  });
  return atomsPromise;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const Provider = ({
  children,
  rscPath,
  rscParams = {},
}: {
  children: ReactNode;
  rscPath: string;
  rscParams: unknown;
}) => {
  if (!isObject(rscParams)) {
    throw new Error('rscParams must be an object');
  }
  const { jotai_atomValues: atomValues, ...rest } = rscParams;
  const atomsPromise = prepareStore(atomValues);
  return (
    <>
      {children}
      <SyncAtoms
        atomsPromise={atomsPromise}
        rscPath={rscPath}
        rscParams={rest}
      />
    </>
  );
};

export const RouterProvider = ({ children }: { children: ReactNode }) => {
  const rscPath = getRscPath() || '';
  const rscParams = getRscParams() || {};
  if (!isObject(rscParams)) {
    throw new Error('rscParams must be an object');
  }
  const { jotai_atomValues: atomValues, ...rest } = rscParams;
  const atomsPromise = prepareStore(atomValues);
  return (
    <>
      {children}
      <SyncAtoms
        atomsPromise={atomsPromise}
        rscPath={rscPath}
        rscParams={rest}
      />
    </>
  );
};
