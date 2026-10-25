import { startTransition, useCallback } from 'react';
import {
  unstable_combineElements as combineElements,
  unstable_isImmutableElement as isImmutableElement,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';
import {
  ROUTER_STATE_ID,
  createInstantRouterState,
  getRouterState,
} from './router-state.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const useMergeInstantElements = () => {
  const mergeElements = useMergeElements();
  return useCallback(
    (
      response: Promise<Elements>,
      pin: (key: string | symbol) => boolean,
      base?: Elements,
      overlay?: Elements,
    ) => {
      const routerState = overlay && getRouterState(overlay);
      const mergeResults = new WeakMap<
        Promise<Elements>,
        Elements | undefined
      >();
      const incoming = mergeElements(response, (previous) => {
        const merged = Promise.resolve(previous).then((current) => {
          const elementsPromise = response.catch(() => current);
          const available = base
            ? combineElements(current, base, {
                filter: (key) =>
                  typeof key === 'string' && !Object.hasOwn(current, key),
              })
            : current;
          const holes: Record<string | symbol, unknown> = {};
          for (const key of Reflect.ownKeys(available)) {
            const pinned = Object.hasOwn(current, key)
              ? pin(key)
              : isImmutableElement(available, String(key));
            if (!pinned) {
              holes[key] = elementsPromise.then((elements) =>
                Object.hasOwn(elements, key)
                  ? elements[key]
                  : base && Object.hasOwn(base, key)
                    ? base[key]
                    : current[key],
              );
            }
          }
          const waiting = combineElements(available, holes);
          const elements = overlay
            ? combineElements(waiting, overlay)
            : waiting;
          const eagerElements = routerState
            ? combineElements(elements, {
                [ROUTER_STATE_ID]: createInstantRouterState(
                  routerState,
                  elements,
                ),
              })
            : elements;
          mergeResults.set(merged, eagerElements);
          return eagerElements;
        });
        mergeResults.set(merged, undefined);
        return merged;
      });
      return incoming.then((resolved) => {
        startTransition(() => {
          void mergeElements(resolved, (previous) => {
            if (!mergeResults.has(previous)) {
              return previous;
            }
            const shouldMerge = (current: Elements, key: string) =>
              !Object.hasOwn(current, key) ||
              !!(overlay && Object.hasOwn(overlay, key));
            const current = mergeResults.get(previous);
            if (
              current &&
              !Object.keys(resolved).some((key) => shouldMerge(current, key))
            ) {
              return previous;
            }
            return previous.then((current) => {
              const elements = combineElements(current, resolved, {
                filter: (key) =>
                  typeof key === 'string' && shouldMerge(current, key),
              });
              return routerState
                ? combineElements(elements, {
                    [ROUTER_STATE_ID]: createInstantRouterState(
                      routerState,
                      elements,
                    ),
                  })
                : elements;
            });
          });
        });
        return resolved;
      });
    },
    [mergeElements],
  );
};
