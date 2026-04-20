import { getErrorInfo } from './lib/utils/custom-errors.js';

/**
 * Highly experimental, the name might change.
 */
export const unstable_allowServer = <T>(x: T) => x;

/**
 * Although it doesn't have `unstable_` prefix, this is still experimental.
 */
export const defaultRootOptions = {
  onCaughtError(error: unknown) {
    if (getErrorInfo(error)) {
      return;
    }
    console.error(error);
  },
};
