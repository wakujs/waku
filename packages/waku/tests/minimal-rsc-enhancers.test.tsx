// @vitest-environment happy-dom

import { StrictMode, Suspense, act, useEffect, useLayoutEffect } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_HEADER, ETAGS_ID } from '../src/lib/utils-isomorphic/etags.js';
import { callServerRsc } from '../src/minimal/client-runtime.js';
import { adoptElements } from '../src/minimal/client-utils/element-etags.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import type {
  RequestRsc,
  RscEnhancer,
} from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: async (response: Promise<Response>) =>
      (await response).json(),
    encodeReply: async (value: unknown) => JSON.stringify(value),
    createTemporaryReferenceSet: () => new Map(),
  },
}));

const roots: ReturnType<typeof createRoot>[] = [];
const request = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', request);
  request.mockReset();
  request.mockImplementation(async () => Response.json({ content: 'initial' }));
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  clearInitialRscEntries();
  Reflect.deleteProperty(import.meta, 'hot');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const mount = async (
  path: string,
  rscEnhancers: readonly RscEnhancer[] = [],
) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  let api: {
    fetch: ReturnType<typeof useFetchRsc>;
    merge: ReturnType<typeof useMergeElements>;
    elements: ReturnType<typeof useElementsPromise>;
  };
  const Probe = () => {
    const fetch = useFetchRsc();
    const merge = useMergeElements();
    const elements = useElementsPromise();
    useEffect(() => {
      api = { fetch, merge, elements };
    });
    return <Slot id="content" />;
  };
  const render = (enhancers: readonly RscEnhancer[]) =>
    root.render(
      <StrictMode>
        <Suspense fallback="pending">
          <Root initialRscPath={path} rscEnhancers={enhancers}>
            <Probe />
          </Root>
        </Suspense>
      </StrictMode>,
    );
  vi.stubGlobal('__WAKU_INITIAL_RSC__', {
    response: Promise.resolve(Response.json({ content: 'initial' })),
  });
  await act(async () => render(rscEnhancers));
  expect(container.textContent).toBe('initial');
  return {
    ...api!,
    container,
    root,
    getElements: () => api.elements,
    rerender: async (enhancers: readonly RscEnhancer[]) => {
      await act(async () => render(enhancers));
    },
  };
};

test('fallback bootstrap runs the configured pipeline once across suspended Strict Mode renders', async () => {
  let respond!: (response: Response) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const calls: string[] = [];
  const enhance: RscEnhancer = (next) => async (path, params, options) => {
    calls.push('enhance');
    const result = await next(
      path + '-enhanced',
      { input: params },
      {
        ...options,
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set('authorization', 'bootstrap');
          return options.fetch(input, { ...init, headers });
        },
      },
    );
    return {
      ...result,
      elements: {
        ...result.elements,
        content: result.elements.content + '-enhanced',
      },
    };
  };
  const enhancers = [enhance];
  const App = () => (
    <Root
      initialRscPath="bootstrap"
      initialRscParams="input"
      rscEnhancers={enhancers}
    >
      <Slot id="content" />
    </Root>
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <StrictMode>
        <Suspense fallback="pending">
          <App />
        </Suspense>
      </StrictMode>,
    ),
  );
  expect(container.textContent).toBe('pending');
  expect(request).toHaveBeenCalledOnce();
  expect(String(request.mock.lastCall![0])).toContain('/bootstrap-enhanced');
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get('authorization'),
  ).toBe('bootstrap');
  expect(JSON.parse(request.mock.lastCall![1]!.body as string)).toEqual({
    input: 'input',
  });
  await act(async () => respond(Response.json({ content: 'initial' })));
  expect(container.textContent).toBe('initial-enhanced');
  expect(request).toHaveBeenCalledOnce();
  expect(calls).toEqual(['enhance']);
});

test('simultaneous fallback Roots with the same input retain their own enhancer results', async () => {
  const responses: (() => void)[] = [];
  request.mockImplementation(
    (_input, init) =>
      new Promise((resolve) => {
        const name = new Headers(init?.headers).get('root');
        responses.push(() => resolve(Response.json({ content: name })));
      }),
  );
  const createEnhancers = (name: string): RscEnhancer[] => [
    (next) => (path, params, options) =>
      next(path, params, {
        ...options,
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set('root', name);
          return options.fetch(input, { ...init, headers });
        },
      }),
  ];
  const firstEnhancers = createEnhancers('first');
  const secondEnhancers = createEnhancers('second');
  const App = ({ enhancers }: { enhancers: RscEnhancer[] }) => (
    <Root initialRscPath="shared" rscEnhancers={enhancers}>
      <Slot id="content" />
    </Root>
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <StrictMode>
        <Suspense fallback="first pending">
          <App enhancers={firstEnhancers} />
        </Suspense>
        <Suspense fallback="second pending">
          <App enhancers={secondEnhancers} />
        </Suspense>
      </StrictMode>,
    ),
  );
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => responses.forEach((respond) => respond()));
  expect(container.textContent).toBe('firstsecond');
  expect(request).toHaveBeenCalledTimes(2);
});

test('streamed hydration bypasses enhancers without another network request', async () => {
  vi.stubGlobal('__WAKU_HYDRATE__', true);
  vi.stubGlobal('__WAKU_INITIAL_RSC__', {
    response: Promise.resolve(Response.json({ content: 'initial' })),
  });
  const enhance = vi.fn<RscEnhancer>(() => {
    throw new Error('unexpected enhancer');
  });
  const container = document.createElement('div');
  container.innerHTML =
    '<meta name="generator" content="Waku"><div>initial</div>';
  document.body.append(container);
  const errors = vi.fn();
  await act(async () => {
    roots.push(
      hydrateRoot(
        container,
        <StrictMode>
          <Root rscEnhancers={[enhance]}>
            <div>
              <Slot id="content" />
            </div>
          </Root>
        </StrictMode>,
        { onRecoverableError: errors },
      ),
    );
  });
  expect(container.textContent).toBe('initial');
  expect(enhance).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

test('a whole cached response applies to the request-time Root', async () => {
  let cached: ReturnType<RequestRsc> | undefined;
  const cache: RscEnhancer =
    (next) =>
    (...args) =>
      (cached ??= next(...args));
  const first = await mount('first', [cache]);
  request.mockImplementation(async () =>
    Response.json({ content: 'cached', _value: 'value' }),
  );
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('value');
  });
  expect(first.container.textContent).toBe('cached');
  request.mockImplementation(async () => Response.json({ content: 'initial' }));
  const second = await mount('second', [cache]);
  request.mockClear();
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('value');
  });
  expect(request).not.toHaveBeenCalled();
  expect(second.container.textContent).toBe('cached');
});

test('composes logical inputs, transport, and decoded elements', async () => {
  const order: string[] = [];
  const first: RscEnhancer = (next) => async (path, params, options) => {
    order.push('first');
    expect(options.type).toBe('rsc');
    const { elements, value } = await next(path + '-first', params, {
      ...options,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('scoped', 'yes');
        const response = await options.fetch(input, { ...init, headers });
        return new Response(
          (await response.text()).replace('server', 'raw'),
          response,
        );
      },
    });
    order.push('first result');
    return {
      elements: { ...elements, content: elements.content + '-decoded' },
      value,
    };
  };
  const second: RscEnhancer = (next) => async (path, params, options) => {
    order.push('second');
    const result = await next(path, { input: params }, options);
    order.push('second result');
    return result;
  };
  const root = await mount('initial', [first, second]);
  const controller = new AbortController();
  request.mockImplementation(async () => Response.json({ content: 'server' }));
  const data = await root.fetch(
    'next',
    { count: 1 },
    { signal: controller.signal },
  );
  expect(data.content).toBe('raw-decoded');
  expect(order).toEqual(['second', 'first', 'first result', 'second result']);
  const [url, init] = request.mock.lastCall!;
  expect(url).toContain('/next-first');
  expect(JSON.parse(init!.body as string)).toEqual({ input: { count: 1 } });
  expect(init?.signal).toBe(controller.signal);
  expect(request.mock.contexts.at(-1)).toBe(globalThis);
  expect(new Headers(init?.headers).get('scoped')).toBe('yes');
  expect(root.container.textContent).toBe('initial');
  await act(async () => {
    await root.merge(data);
  });
  expect(root.container.textContent).toBe('raw-decoded');
});

test('Root-bound requests stay isolated and actions keep their request-time enhancer chain', async () => {
  const firstEnhancer = vi.fn((path: string) => path + '-first');
  const first = await mount('first', [
    (next) => (path, params, options) =>
      next(firstEnhancer(path), params, options),
  ]);
  const actionTypes: string[] = [];
  const second = await mount('second', [
    (next) => async (path, params, options) => {
      actionTypes.push(options.type);
      const { elements, value } = await next(path + '-second', params, options);
      return {
        elements: { ...elements, content: elements.content + '-second' },
        value,
      };
    },
  ]);
  await first.fetch('scoped');
  expect(request.mock.lastCall![0]).toContain('scoped-first');
  expect(actionTypes).toEqual([]);
  let respond!: (response: Response) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        respond = resolve;
      }),
  );
  const action = callServerRsc('file#action', []);
  await act(async () => second.root.unmount());
  await act(async () => {
    respond(Response.json({ _value: 42, content: 'action' }));
    expect(await action).toBe(42);
  });
  expect(actionTypes).toEqual(['call']);
  expect(first.container.textContent).toBe('initial');
  expect(firstEnhancer).toHaveBeenCalledTimes(1);
});

test('filtering action elements preserves the return value and Minimal build checks', async () => {
  const root = await mount('initial', [
    (next) =>
      async (...args) => {
        const { elements, value } = await next(...args);
        expect(elements).not.toHaveProperty('_value');
        return { elements: {}, value };
      },
  ]);
  request.mockImplementation(async () =>
    Response.json({ _value: 'result', content: 'changed' }),
  );
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('result');
  });
  expect(root.container.textContent).toBe('initial');
  vi.stubEnv('WAKU_BUILD_ID', 'current');
  request.mockImplementation(async () => Response.json({ _buildId: 'old' }));
  const mismatch = vi.fn();
  expect(
    await root.fetch('next', undefined, { onBuildIdMismatch: mismatch }),
  ).toEqual({});
  expect(mismatch).toHaveBeenCalledOnce();
  request.mockImplementation(async () =>
    Response.json({ _location: '/elsewhere' }),
  );
  await expect(root.fetch('next')).rejects.toThrow('document navigation');
});

test('action enhancers can return only client-owned symbol keys', async () => {
  const key = Symbol();
  const root = await mount('initial', [
    (next) =>
      async (...args) => {
        const { value } = await next(...args);
        return { elements: { [key]: 'updated' }, value };
      },
  ]);
  await act(async () => {
    await callServerRsc('file#action', []);
  });
  expect((await root.getElements())[key]).toBe('updated');
});

test('Root-bound fetches only claim validators from an explicit base', async () => {
  const root = await mount('initial');
  const base = adoptElements({
    content: 'retained',
    [ETAGS_ID]: { content: 'version' },
  });
  await act(async () => {
    await root.merge(base);
  });
  request.mockImplementation(async () => Response.json({}));
  await root.fetch('next');
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get(ETAGS_HEADER),
  ).toBe('{}');
  expect(await root.fetch('next', undefined, { unstable_base: base })).toEqual(
    {},
  );
  expect((await root.getElements()).content).toBe('retained');
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get(ETAGS_HEADER),
  ).toBe('{"content":"version"}');
});

test('configured enhancers compose in array order for fetches and actions', async () => {
  const calls: string[] = [];
  const trace =
    (name: string): RscEnhancer =>
    (next) =>
    async (...args) => {
      calls.push(name);
      const result = await next(...args);
      calls.push(name + ' result');
      return result;
    };
  const root = await mount('initial', [trace('A'), trace('B')]);
  calls.length = 0;
  const expected = ['B', 'A', 'A result', 'B result'];
  await root.fetch('next');
  expect(calls).toEqual(expected);
  calls.length = 0;
  request.mockImplementation(async () => Response.json({ _value: 'value' }));
  await act(async () => {
    expect(await callServerRsc('file#action', [])).toBe('value');
  });
  expect(calls).toEqual(expected);
});

test('configured entries are snapshotted while their request data stays live', async () => {
  let locale = 'en';
  const localized: RscEnhancer = (next) => (path, params, options) =>
    next(path + '-' + locale, params, options);
  const replaced = vi.fn<RscEnhancer>((next) => next);
  const enhancers = [localized];
  const first = await mount('first', enhancers);
  const second = await mount('second', [
    (next) => (path, params, options) =>
      next(path + '-second', params, options),
  ]);
  enhancers[0] = replaced;
  await first.rerender([replaced]);
  locale = 'fr';
  await first.fetch('next');
  expect(request.mock.lastCall![0]).toContain('/next-fr');
  await second.fetch('next');
  expect(request.mock.lastCall![0]).toContain('/next-second');
  expect(replaced).not.toHaveBeenCalled();
});

test('a descendant layout effect finds the configured pipeline on its first fetch', async () => {
  const enhance: RscEnhancer = (next) => (path, params, options) =>
    next(path + '-enhanced', params, options);
  const pending: Promise<unknown>[] = [];
  const Probe = () => {
    const fetchRsc = useFetchRsc();
    useLayoutEffect(() => {
      pending.push(fetchRsc('layout'));
    }, [fetchRsc]);
    return <Slot id="content" />;
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <Suspense fallback="pending">
          <Root rscEnhancers={[enhance]}>
            <Probe />
          </Root>
        </Suspense>
      </StrictMode>,
    );
  });
  await Promise.all(pending);
  expect(pending).toHaveLength(2);
  expect(
    request.mock.calls.filter(([input]) => String(input).includes('/layout')),
  ).toEqual([
    [expect.stringContaining('/layout-enhanced'), expect.anything()],
    [expect.stringContaining('/layout-enhanced'), expect.anything()],
  ]);
});

test('a development reload replaces server entries and retains omitted client symbols', async () => {
  Object.defineProperty(import.meta, 'hot', { configurable: true, value: {} });
  const CLIENT_STATE = Symbol();
  const root = await mount('initial', [
    (next) => (path, params, options) =>
      next(path, params, {
        ...options,
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          headers.set('configured', 'yes');
          return options.fetch(input, { ...init, headers });
        },
      }),
  ]);
  await act(async () => {
    await root.merge({ obsolete: 'removed', [CLIENT_STATE]: 'retained' });
  });
  request.mockImplementation(async () =>
    Response.json({ content: 'reloaded' }),
  );

  await act(async () => {
    (
      globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] }
    ).__WAKU_RSC_RELOAD_LISTENERS__?.at(-1)?.();
  });

  expect(root.container.textContent).toBe('reloaded');
  expect(
    new Headers(request.mock.lastCall![1]?.headers).get('configured'),
  ).toBe('yes');
  const elements = await root.getElements();
  expect('obsolete' in elements).toBe(false);
  expect(elements[CLIENT_STATE]).toBe('retained');
});

test('a development reload keeps only the symbols the enhanced response omits', async () => {
  Object.defineProperty(import.meta, 'hot', { configurable: true, value: {} });
  const RETAINED = Symbol();
  const CLEARED = Symbol();
  let version = 0;
  const root = await mount('initial', [
    (next) =>
      async (...args) => {
        const { elements, value } = await next(...args);
        version += 1;
        return {
          elements: {
            ...elements,
            [RETAINED]: 'retained',
            ...(version === 1
              ? { [CLEARED]: 'clear me' }
              : { [CLEARED]: undefined }),
          },
          value,
        };
      },
  ]);
  request.mockImplementation(async () =>
    Response.json({ content: 'reloaded' }),
  );
  const reload = () =>
    act(async () => {
      (
        globalThis as { __WAKU_RSC_RELOAD_LISTENERS__?: (() => void)[] }
      ).__WAKU_RSC_RELOAD_LISTENERS__?.at(-1)?.();
    });

  await reload();
  expect(await root.getElements()).toMatchObject({
    content: 'reloaded',
    [RETAINED]: 'retained',
    [CLEARED]: 'clear me',
  });

  await reload();
  const elements = await root.getElements();
  expect(elements[RETAINED]).toBe('retained');
  expect(CLEARED in elements).toBe(true);
  expect(elements[CLEARED]).toBeUndefined();
});

test('an enhancer that throws rejects the request', async () => {
  const failure = new Error('bad enhancer');
  const root = await mount('initial', [
    () => () => {
      throw failure;
    },
  ]);

  await expect(root.fetch('next')).rejects.toBe(failure);
});

test('duplicate entries each wrap the request', async () => {
  const seen = vi.fn();
  const count: RscEnhancer =
    (next) =>
    (...args) => {
      seen();
      return next(...args);
    };
  const root = await mount('initial', [count, count]);

  await root.fetch('next');
  expect(seen).toHaveBeenCalledTimes(2);
});
