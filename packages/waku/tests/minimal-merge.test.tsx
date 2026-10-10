// @vitest-environment happy-dom

import { StrictMode, Suspense, act, use, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

const mocks = vi.hoisted(() => ({
  initial: {} as Elements,
}));
vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: (response: Promise<Response>) =>
      response.then(() => mocks.initial),
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const controls = new Map<
  string,
  {
    merge: ReturnType<typeof useMergeElements>;
    elements: Promise<Elements>;
  }
>();
let root: ReturnType<typeof createRoot> | undefined;

const Probe = ({ id }: { id: string }) => {
  const merge = useMergeElements();
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  useLayoutEffect(() => {
    controls.set(id, { merge, elements: elementsPromise });
  });
  return <output data-root={id}>{Object.keys(elements).join(',')}</output>;
};

const mount = async (children: ReactNode) => {
  const container = document.createElement('div');
  root = createRoot(container);
  await act(async () => {
    root!.render(<StrictMode>{children}</StrictMode>);
    await flush();
  });
  return container;
};

const app = (id: string, children?: ReactNode) => (
  <Root initialRscPath="initial">
    <Probe id={id} />
    {children}
  </Root>
);

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', async () => new Response('{}'));
  clearInitialRscEntries();
  controls.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  clearInitialRscEntries();
  vi.unstubAllGlobals();
});

test('an updater derives from the queued predecessor and can replace its record', async () => {
  mocks.initial = { page: 'initial', remove: 'old' };
  const view = await mount(app('a', <Slot id="page" />));
  const pending = Promise.withResolvers<Elements>();
  const seen = vi.fn((elements: Elements) => ({
    page: elements.page + ' derived',
    added: elements.added,
  }));
  await act(async () => {
    void controls.get('a')!.merge(pending.promise);
    void controls.get('a')!.merge({}, (previous) => previous.then(seen));
    await flush();
  });
  await act(async () => {
    pending.resolve({ page: 'queued', added: 'retained' });
    await flush();
  });
  expect(view.textContent).toContain('queued derived');
  expect(view.querySelector('output')?.textContent).toBe('page,added');
  expect(seen).toHaveBeenCalledTimes(1);
  expect(seen.mock.calls[0]?.[0]).toMatchObject({
    added: 'retained',
    remove: 'old',
  });
});

test('a no-op updater preserves the fulfilled Root promise', async () => {
  mocks.initial = { page: 'initial' };
  const fallback = vi.fn(() => 'outer');
  const Fallback = fallback;
  const view = await mount(
    <Suspense fallback={<Fallback />}>{app('a', <Slot id="page" />)}</Suspense>,
  );
  fallback.mockClear();
  await act(async () => {
    void controls.get('a')!.merge({}, (previous) => previous);
  });
  expect(view.textContent).toContain('initial');
  expect(fallback).not.toHaveBeenCalled();
});

test('updater results are stable when StrictMode replays the update', async () => {
  mocks.initial = { page: 'initial' };
  const view = await mount(app('a', <Slot id="page" />));
  const update = vi.fn((previous: Promise<Elements>) =>
    previous.then((elements) => combineElements(elements, { page: 'changed' })),
  );
  await act(async () => {
    void controls.get('a')!.merge({}, update);
    await flush();
  });
  expect(view.textContent).toContain('changed');
  expect(update).toHaveBeenCalledTimes(1);
});

test('a custom merge receives a recovered payload while its caller sees the rejection', async () => {
  mocks.initial = { page: 'initial' };
  const view = await mount(app('a', <Slot id="page" />));
  const received = vi.fn();
  const error = new Error('offline');

  await act(async () => {
    const result = controls
      .get('a')!
      .merge(Promise.reject(error), (previous, incoming) =>
        Promise.all([previous, incoming]).then(([current, elements]) => {
          received(elements);
          return combineElements(current, elements);
        }),
      );
    await expect(result).rejects.toBe(error);
    await flush();
  });

  expect(received).toHaveBeenCalledWith({});
  expect(view.textContent).toContain('initial');
});

test('an overlay lands with the response it came with', async () => {
  mocks.initial = { page: 'A' };
  await mount(app('a'));
  await act(async () => {
    await controls
      .get('a')!
      .merge(
        Promise.resolve({ page: 'B' }).then((elements) =>
          combineElements(elements, { nav: 'from the client' }),
        ),
      );
  });
  const merged = await controls.get('a')!.elements;
  expect(merged.page).toBe('B');
  expect(merged.nav).toBe('from the client');
});

test('an overlay is dropped when the response fails', async () => {
  mocks.initial = { page: 'A' };
  await mount(app('a'));
  await act(async () => {
    await controls
      .get('a')!
      .merge(
        Promise.reject(new Error('rejected')).then((elements) =>
          combineElements(elements, { nav: 'from the client' }),
        ),
      )
      .catch(() => {});
  });
  const merged = await controls.get('a')!.elements;
  expect(merged.page).toBe('A');
  expect('nav' in merged).toBe(false);
});
