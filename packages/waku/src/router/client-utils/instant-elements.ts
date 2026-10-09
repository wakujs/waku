import { useCallback } from 'react';
import {
  unstable_combineElements as combineElements,
  unstable_isImmutableElement as isImmutableElement,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';

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
      const mergeResults = new WeakMap<
        Promise<Elements>,
        Elements | undefined
      >();
      const incoming = mergeElements(response, (previous, recovered) => {
        const merged = Promise.resolve(previous).then((current) => {
          const available = base
            ? combineElements(current, base, {
                unstable_filter: (key) =>
                  typeof key === 'string' && !(key in current),
              })
            : current;
          const holes: Record<string | symbol, unknown> = {};
          for (const key of Reflect.ownKeys(available)) {
            const pinned =
              key in current
                ? pin(key)
                : isImmutableElement(available, String(key));
            if (!pinned) {
              holes[key] = recovered.then((elements) =>
                key in elements
                  ? elements[key]
                  : base && key in base
                    ? base[key]
                    : current[key],
              );
            }
          }
          const waiting = combineElements(available, holes);
          const elements = overlay
            ? combineElements(waiting, overlay)
            : waiting;
          mergeResults.set(merged, elements);
          return elements;
        });
        mergeResults.set(merged, undefined);
        return merged;
      });
      return incoming.then((resolved) => {
        void mergeElements(resolved, (previous) => {
          if (!mergeResults.has(previous)) {
            return previous;
          }
          const shouldMerge = (current: Elements, key: string) =>
            !(key in current) || !!(overlay && key in overlay);
          const current = mergeResults.get(previous);
          if (
            current &&
            !Object.keys(resolved).some((key) => shouldMerge(current, key))
          ) {
            return previous;
          }
          return previous.then((current) =>
            combineElements(current, resolved, {
              unstable_filter: (key) =>
                typeof key === 'string' && shouldMerge(current, key),
            }),
          );
        });
        return resolved;
      });
    },
    [mergeElements],
  );
};
