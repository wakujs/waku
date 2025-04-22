import { cache } from 'react';
import type { ReactNode } from 'react';
import type { Atom } from 'jotai/vanilla';
import { INTERNAL_buildStoreRev1 as buildStore } from 'jotai/vanilla/internals';
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
} from 'jotai/vanilla/internals';
import { unstable_getRscParams as getRscParams } from 'waku/router/server';

import { BaseSyncAtoms, SyncAtoms } from './client';

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

const getStoreFns = cache(() => {
  let resolveStore: (store: Store) => void;
  const promise = new Promise<Store>((resolve) => {
    resolveStore = resolve;
  });
  const setStore = (store: Store) => {
    resolveStore(store);
  };
  const getStore = () => promise;
  return { setStore, getStore };
});

export const getStore = () => {
  const { getStore } = getStoreFns();
  return getStore();
};

const ensureMap = (value: unknown) =>
  value instanceof Map ? value : new Map();

const prepareStore = (rscParams: unknown) => {
  const clientAtomValues = ensureMap(
    (rscParams as { jotai_atomValues?: unknown } | undefined)?.jotai_atomValues,
  );
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
  const { setStore } = getStoreFns();
  setStore(store);
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

export const BaseProvider = ({
  children,
  rscPath,
  rscParams,
}: {
  children: ReactNode;
  rscPath: string;
  rscParams: unknown;
}) => {
  const atomsPromise = prepareStore(rscParams);
  return (
    <>
      {children}
      <BaseSyncAtoms rscPath={rscPath} atomsPromise={atomsPromise} />
    </>
  );
};

export const Provider = ({ children }: { children: ReactNode }) => {
  const rscParams = getRscParams();
  const atomsPromise = prepareStore(rscParams);
  return (
    <>
      {children}
      <SyncAtoms atomsPromise={atomsPromise} />
    </>
  );
};
