'use client';

import {
  INTERNAL_ServerRoot as ServerRoot,
  unstable_addBase as addBase,
  unstable_callServerRsc as callServerRsc,
  unstable_isImmutableElement as isImmutableElement,
  unstable_removeBase as removeBase,
  useMergeElements_UNSTABLE as useMergeElements,
} from './client-runtime.js';

export {
  Root_UNSTABLE,
  Slot_UNSTABLE,
  Children_UNSTABLE,
  useFetchRsc_UNSTABLE,
  useRegisterRscEnhancer_UNSTABLE,
  useRegisterRscReloadListener_UNSTABLE,
  useElementsPromise_UNSTABLE,
  unstable_combineElements,
  unstable_getErrorInfo,
} from './client-runtime.js';

type MergeElements = ReturnType<typeof useMergeElements>;

/**
 * Returns a function that merges an element record or its promise into the
 * enclosing Root. A rejected payload leaves the current elements unchanged.
 */
export const useMergeElements_UNSTABLE: () => {
  (elements: Parameters<MergeElements>[0]): ReturnType<MergeElements>;
  /** @deprecated Overlay and SWR options are reserved for framework internals. */
  (...args: Parameters<MergeElements>): ReturnType<MergeElements>;
} = useMergeElements;

/** @deprecated Immutable-slot inspection is reserved for framework internals. */
export const unstable_isImmutableElement = isImmutableElement;

/** @deprecated Base-path handling is reserved for framework internals. */
export const unstable_addBase = addBase;

/** @deprecated Base-path handling is reserved for framework internals. */
export const unstable_removeBase = removeBase;

/** @deprecated Reserved for Waku's client bootstrap. */
export const unstable_callServerRsc = callServerRsc;

/** @deprecated Reserved for Waku's HTML renderer. */
export const INTERNAL_ServerRoot = ServerRoot;
