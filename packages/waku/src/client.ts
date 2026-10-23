import { isRenderCancellation } from './lib/utils-isomorphic/render-cancellation.js';

// Experimental, the name and the behavior might change.
export const unstable_allowServer = <T>(x: T) => x;

// Unsure if this is going to be a public API in the future.
export const unstable_defaultRootOptions = {
  onCaughtError(error: unknown) {
    if (
      isRenderCancellation(error) ||
      (error instanceof Error &&
        error.cause instanceof Response &&
        error.cause.status === 404)
    ) {
      return;
    }
    console.error(error);
  },
};
