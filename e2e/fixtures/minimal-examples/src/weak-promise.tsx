import { Suspense, version } from 'react';
import reactPackage from 'react/package.json';
import domPackage from 'react-dom/package.json';
import flightPackage from 'react-server-dom-webpack/package.json';
import { Slot_UNSTABLE as Slot } from 'waku/minimal/client';
import { unstable_createWeakPromise as createWeakPromise } from 'waku/minimal/server';
import type { Unstable_HandleRequest } from 'waku/minimal/server';
import { WeakPromiseProbe } from './components/WeakPromise';
import { INTENT_ID, RUNTIME_ID, WEAK_APP_ID } from './weak-promise-protocol';

const releases = new Map<string, () => void>();

export const handleWeakPromise: Unstable_HandleRequest = async (
  input,
  { renderRsc, renderHtml },
) => {
  const url = new URL(input.req.url);
  if (input.type === 'http' && input.pathname === '/weak-release') {
    const release = releases.get(url.searchParams.get('id') ?? '');
    if (!release) {
      return new Response('unknown render', { status: 404 });
    }
    release();
    return new Response('released');
  }
  if (
    !(input.type === 'rsc' && input.rscPath === 'weak') &&
    !(
      input.type === 'http' &&
      (input.pathname === '/weak' || input.pathname === '/weak-flight')
    )
  ) {
    return;
  }
  const params =
    input.type === 'rsc'
      ? ((input.rscParams as { kind: string; id: string } | undefined) ?? {
          kind: 'unused',
          id: '',
        })
      : {
          kind: url.searchParams.get('kind') ?? 'unused',
          id: url.searchParams.get('id') ?? '',
        };
  const { promise, resolve } = createWeakPromise();
  const gate = Promise.withResolvers<void>();
  const release = () => {
    releases.delete(params.id);
    input.req.signal.removeEventListener('abort', release);
    gate.resolve();
  };
  if (params.kind === 'unused') {
    gate.resolve();
  } else {
    releases.set(params.id, release);
    input.req.signal.addEventListener('abort', release, { once: true });
  }
  function Early() {
    if (params.kind === 'early') {
      resolve('early intent');
    }
    return null;
  }
  async function Body() {
    await gate.promise;
    if (params.kind === 'late') {
      resolve('late intent');
    }
    return <p data-testid="weak-body">complete</p>;
  }
  const stream = await renderRsc({
    [INTENT_ID]: promise,
    [RUNTIME_ID]: {
      react: version,
      reactPackage: reactPackage.version,
      reactDomPackage: domPackage.version,
      flightPackage: flightPackage.version,
    },
    [WEAK_APP_ID]: (
      <html>
        <head />
        <body>
          <h1 data-testid="weak-shell">Weak promise</h1>
          <WeakPromiseProbe />
          <Early />
          <Suspense fallback={<p data-testid="weak-loading">loading</p>}>
            <Body />
          </Suspense>
        </body>
      </html>
    ),
  });
  if (input.type === 'rsc' || input.pathname === '/weak-flight') {
    return stream;
  }
  return renderHtml(stream, <Slot id={WEAK_APP_ID} />, { rscPath: 'weak' });
};
