# Weak-thenable API reference

These probes use the workspace's React, React DOM, and React Server DOM Webpack
installation and verify that their versions match. They use the public webpack
edge entry points without patching React.

The unstable API, exported from `waku/minimal/server`, is:

```ts
const { promise, resolve } = unstable_createWeakPromise<string>();
// promise: PromiseLike<string | undefined>
// resolve: (value: string) => void
```

Put the promise directly in the flat elements record. The producer accepts
strings and notifies listeners synchronously; its first resolution wins. Encode
route data at the Router boundary. An unused decoded promise may remain pending
or resolve undefined. Consumers must treat both as absence of an intent and
must not depend on observing unused completion through the promise alone.

React 19.3.1 uses `weak-promise-stream.ts` around `renderRsc`. The filter replaces
top-level weak promises with settled marker promises, suppresses their marker
rows, and publishes resolved strings at complete Flight record boundaries. On
ordinary stream completion it resolves unused references with undefined.
Length-prefixed records pass through without inspecting their contents.

The experimental reference uses React's native weak references and needs only
the thenable factory. Both implementations use React's client decoder directly;
the weak-promise API has no extra completion helper.

`pnpm test` includes these development and production probes. To run them alone
from the repository root:

```sh
pnpm -F waku test:weak-promise
```

The RSC probe checks native streaming, early and late intents, first resolution,
ordinary async dependencies, streams/iterators, binary fragmentation, aliases,
shared producers, request isolation, cancellation, and transport failure. Its
expected absence behavior follows the pinned runtime. The experimental reference
retains a pending weak promise on EOF or failure; the stable fallback returns
undefined on ordinary stream completion and rejects an unpublished reference on
transport failure. Production-path probes use `createRenderUtils` to verify EOF
and transport cancellation. The direct-filter request-abort probe supplies an
additional signal; `renderRsc` itself has no signal option.

The SSR probe runs the RSC renderer in a separate process with the `react-server`
condition. The parent uses the matched React DOM server and Flight decoder with
normal conditions. It verifies an HTML shell precedes late redirects/not-found
and that observing Flight EOF lets unused intents finish HTML rendering. A
control verifies that directly suspending on an unused native weak promise
keeps HTML pending; the stable fallback can finish directly because its promise
resolves undefined.

The EOF observer in the SSR fixture is illustrative lifecycle handling, not a
new public API or integrated Router change. Waku browser integration is covered by the route-intent and weak-promise E2E fixtures.
