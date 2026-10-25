import { getErrorInfo } from './lib/utils-isomorphic/custom-errors.js';

// Experimental, the name and the behavior might change.
export const unstable_allowServer = <T>(x: T) => x;

// React's default transition indicator replaces the current URL through the
// Navigation API. WebKit accepts that policy check and then never commits a
// same-document navigation, so Playwright waits forever on the next locator
// action. Repeating the current history entry makes WebKit emit the commit.
const flushReactTransitionNavigation = () => {
  if (typeof window === 'undefined' || !window.navigation) {
    return;
  }
  let reactTransition = false;
  window.navigation.addEventListener('navigate', (event) => {
    reactTransition = event.info === 'react-transition';
  });
  window.navigation.addEventListener('navigatesuccess', () => {
    if (!reactTransition) {
      return;
    }
    reactTransition = false;
    window.history.replaceState(window.history.state, '', window.location.href);
  });
};

flushReactTransitionNavigation();

// Unsure if this is going to be a public API in the future.
export const unstable_defaultRootOptions = {
  onCaughtError(error: unknown) {
    if (getErrorInfo(error)) {
      return;
    }
    console.error(error);
  },
};
