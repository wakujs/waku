import { getContext } from './lib/context.js';

export {
  getContext as unstable_getContext,
  getContextData as unstable_getContextData,
} from './lib/context.js';

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
