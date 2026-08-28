import { clearInitialRscEntries } from './initial-rsc-store.js';
import { clearRootCachedEtags, getDefaultRootStore } from './root-store.js';
import type { RootStore } from './root-store.js';

type Unregister = () => void;

export type RegisterRscReloadListener = (
  listener: () => void,
  options?: { replace?: boolean },
) => Unregister;

type RootReload = {
  fallback: () => void;
  replacement?: () => void;
};

const rootReloads = new WeakMap<RootStore, RootReload>();

const setActiveRscReloadListener = (listener: (() => void) | undefined) => {
  const listeners = (globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
  const active = globalThis.__WAKU_REFETCH_RSC__;
  const activeIndex = active ? listeners.indexOf(active) : -1;
  if (listener) {
    if (activeIndex === -1) {
      listeners.push(listener);
    } else {
      listeners.splice(activeIndex, 1, listener);
    }
  } else if (activeIndex !== -1) {
    listeners.splice(activeIndex, 1);
  }
  globalThis.__WAKU_REFETCH_RSC__ = listener;
};

const activateDefaultRscReloadListener = (): void => {
  const store = getDefaultRootStore();
  if (!store) {
    setActiveRscReloadListener(undefined);
    return;
  }
  const reload = rootReloads.get(store);
  setActiveRscReloadListener(reload?.replacement ?? reload?.fallback);
};

const createRscReloadListener =
  (listener: () => void): Unregister =>
  () => {
    clearRootCachedEtags();
    clearInitialRscEntries();
    listener();
  };

const addRscReloadListener = (listener: () => void): Unregister => {
  const listeners = (globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= []);
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  };
};

export const registerRootRscReloadListener = (
  store: RootStore,
  listener: () => void,
  options?: { replace?: boolean },
): Unregister => {
  if (!options?.replace) {
    return addRscReloadListener(listener);
  }

  const rootReload = rootReloads.get(store);
  if (!rootReload) {
    throw new Error('Missing Root component');
  }
  const registered = createRscReloadListener(listener);
  rootReload.replacement = registered;
  if (getDefaultRootStore() === store) {
    setActiveRscReloadListener(registered);
  }
  return () => {
    if (rootReload.replacement === registered) {
      delete rootReload.replacement;
    }
    if (globalThis.__WAKU_REFETCH_RSC__ === registered) {
      activateDefaultRscReloadListener();
    }
  };
};

export const registerRootReload = (
  store: RootStore,
  fallback: () => void,
): Unregister => {
  const rootReload: RootReload = {
    fallback: createRscReloadListener(fallback),
  };
  rootReloads.set(store, rootReload);
  activateDefaultRscReloadListener();
  return () => {
    rootReloads.delete(store);
    activateDefaultRscReloadListener();
  };
};

export const registerDefaultRscReloadListener: RegisterRscReloadListener = (
  listener,
  options,
) => {
  if (!import.meta.hot) {
    return () => {};
  }
  if (!options?.replace) {
    return addRscReloadListener(listener);
  }
  const store = getDefaultRootStore();
  if (!store) {
    throw new Error('Missing Root component');
  }
  return registerRootRscReloadListener(store, listener, options);
};
