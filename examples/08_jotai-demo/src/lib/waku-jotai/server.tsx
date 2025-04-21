import { cache } from 'react';
import type { ReactNode } from 'react';
import type { Atom } from 'jotai/vanilla';
import { INTERNAL_buildStoreRev1 as buildStore } from 'jotai/vanilla/internals';
import type {
  INTERNAL_AtomState as AtomState,
  INTERNAL_AtomStateMap as AtomStateMap,
} from 'jotai/vanilla/internals';
import { unstable_getRscParams as getRscParams } from 'waku/router/server';

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

const createStore = (clientAtomValues: Map<ClientReferenceId, unknown>) => {
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
  const getAtoms = () => clientAtoms;
  const waitForAtoms = async () => {
    let size: number;
    do {
      size = atomStateMap.size;
      await Promise.all(Array.from(atomStateMap.values()).map((s) => s.v));
    } while (size !== atomStateMap.size);
  };
  return Object.assign(store, {
    getAtoms,
    waitForAtoms,
  });
};

const getStoreFns = cache(() => {
  let resolveStore: (store: ReturnType<typeof createStore>) => void;
  const promise = new Promise<ReturnType<typeof createStore>>((resolve) => {
    resolveStore = resolve;
  });
  const setStore = (store: ReturnType<typeof createStore>) => {
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

export const Provider = ({ children }: { children: ReactNode }) => {
  const rscParams = getRscParams();
  const serializedAtomValues = ensureMap(
    (rscParams as { jotai_atomValues?: unknown } | undefined)?.jotai_atomValues,
  );
  let resolveAtoms: (m: Map<Atom<unknown>, string>) => void;
  const atomsPromise = new Promise<Map<Atom<unknown>, string>>((r) => {
    resolveAtoms = r;
  });
  const store = createStore(serializedAtomValues);
  const { setStore } = getStoreFns();
  setStore(store);
  setTimeout(() => {
    store
      .waitForAtoms()
      .then(() => {
        const atoms = store.getAtoms();
        resolveAtoms(atoms);
      })
      .catch(() => {});
  });
  return (
    <>
      {children}
      <SyncAtoms atomsPromise={atomsPromise} />
    </>
  );
};
