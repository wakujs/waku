/**
 * Creates a fulfill-only weak thenable for a top-level `renderRsc` element.
 * It does not keep rendering open. Values must be strings; callers encode data.
 * The first resolution wins and listeners run synchronously. Only values
 * published while rendering is active reach the receiver. An unused decoded
 * promise may remain pending or resolve undefined; observe it without suspending.
 *
 * @example
 * const { promise, resolve } = unstable_createWeakPromise<string>();
 * // Pass `promise` as an element; rendering code can call `resolve('value')`.
 */
export function createWeakPromise<T extends string = string>(): {
  promise: PromiseLike<T | undefined>;
  resolve: (value: T) => void;
} {
  let value: T | undefined;
  const listeners = new Set<(value: T) => void>();
  const promise = {
    get status() {
      return value !== undefined
        ? ('fulfilled' as const)
        : ('pending_weak' as const);
    },
    get value() {
      return value;
    },
    then<TResult1 = T | undefined, TResult2 = never>(
      onFulfilled?:
        ((value: T | undefined) => TResult1 | PromiseLike<TResult1>) | null,
      _onRejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return new Promise((resolve, reject) => {
        const fulfill = (value: T) => {
          try {
            resolve(
              onFulfilled ? onFulfilled(value) : (value as unknown as TResult1),
            );
          } catch (error) {
            reject(error);
          }
        };
        if (value !== undefined) {
          fulfill(value);
        } else {
          listeners.add(fulfill);
        }
      });
    },
  };
  return {
    promise,
    resolve(next) {
      if (value !== undefined) {
        return;
      }
      value = next;
      for (const listener of listeners) {
        listener(next);
      }
      listeners.clear();
    },
  };
}
