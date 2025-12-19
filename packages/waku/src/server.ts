import { getContext } from './lib/context.js';
export {
  getContext as unstable_getContext,
  getContextData as unstable_getContextData,
} from './lib/context.js';
/**
 * Highly experimental API to load SSR modules.
 * This is a compiler hint.
 */
export const unstable_loadSsrModule = <T>(_id: string): Promise<T> => {
  throw new Error('This will be transfomed by the compiler.');
}

// The use of `globalThis` in this file is more or less a hack.
// It should be revisited with a better solution.

/**
 * This is an internal function and not for public use.
 */
export function INTERNAL_setAllEnv(newEnv: Readonly<Record<string, string>>) {
  (globalThis as any).__WAKU_SERVER_ENV__ = newEnv;
}

export function getEnv(key: string): string | undefined {
  return (globalThis as any).__WAKU_SERVER_ENV__?.[key];
}

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return Object.fromEntries(getContext().req.headers.entries());
}
