import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
} from 'waku/minimal/client';
import {
  RscEnhancements,
  createRscEnhancer,
} from './components/rsc-enhancements.js';

const multipleRoots = new URLSearchParams(window.location.search).has(
  'multiple-roots',
);

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App" />
    </Root>
  </StrictMode>
);

if (multipleRoots) {
  const bootstrap = new URLSearchParams(window.location.search).has(
    'bootstrap-enhancers',
  );
  const fetchOnMount = new URLSearchParams(window.location.search).has(
    'declarative-enhancers',
  );
  type RootName = 'first' | 'second' | 'third';
  const mounted = new Set<RootName>();
  const mountRoot = (name: RootName) => {
    if (mounted.has(name)) {
      return;
    }
    mounted.add(name);
    const container = document.createElement('div');
    container.dataset.testid = `${name}-root`;
    document.body.appendChild(container);
    const reactRoot = createRoot(container, defaultRootOptions);
    let initialRscParams: unknown;
    const enhanced =
      fetchOnMount ||
      bootstrap ||
      new URLSearchParams(window.location.search).has('enhancers');
    const enhancers = enhanced ? [createRscEnhancer(name)] : [];
    const renderRoot = () => {
      reactRoot.render(
        <StrictMode>
          <Root
            initialRscPath={bootstrap ? 'bootstrap' : name}
            initialRscParams={initialRscParams}
            rscEnhancers={enhancers}
          >
            {bootstrap && (
              <p data-testid="bootstrap-input">
                <Slot id="EnhancerInput" />
              </p>
            )}
            {(fetchOnMount ||
              new URLSearchParams(window.location.search).has('enhancers')) && (
              <RscEnhancements fetchOnMount={fetchOnMount} />
            )}
            <Slot id="Content" />
          </Root>
        </StrictMode>,
      );
    };
    renderRoot();
    if (name !== 'first') {
      const unmount = document.createElement('button');
      unmount.dataset.testid = `unmount-${name}-root`;
      unmount.textContent = `Unmount ${name} root`;
      unmount.addEventListener('click', () => reactRoot.unmount());
      document.body.appendChild(unmount);
    }
    if (name === 'second') {
      const rerender = document.createElement('button');
      rerender.dataset.testid = 'rerender-second-root';
      rerender.textContent = 'Rerender second root';
      rerender.addEventListener('click', () => {
        initialRscParams = {};
        renderRoot();
      });
      document.body.appendChild(rerender);
    }
  };
  const global = globalThis as typeof globalThis & {
    __WAKU_MOUNT_ROOT__?: (name: RootName) => void;
  };
  global.__WAKU_MOUNT_ROOT__ = mountRoot;
  mountRoot('first');
  if (new URLSearchParams(window.location.search).has('simultaneous-roots')) {
    mountRoot('second');
  }
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
