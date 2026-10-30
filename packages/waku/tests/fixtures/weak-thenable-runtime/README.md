# Weak-thenable API reference

These probes use the workspace's React, React DOM, and React Server DOM Webpack
installation and verify that their versions match. They use the public webpack
edge entry points without patching React.

This experimental preview requires the matching React versions declared in
Waku's peer dependencies. Workspace overrides apply only inside this repository;
applications using a preview package must install the experimental runtime:

```sh
pnpm add react@0.0.0-experimental-ab0d927f-20261020 react-dom@0.0.0-experimental-ab0d927f-20261020 react-server-dom-webpack@0.0.0-experimental-ab0d927f-20261020
```

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

`renderRsc` uses React's native weak references and the thenable factory. React
closes the stream without waiting for unused weak work. The probes use React's
client decoder directly.

`pnpm test` includes these development and production probes. To run them alone
from the repository root:

```sh
pnpm -F waku test:weak-promise
```

The RSC probe checks native streaming, early and late intents, first resolution,
ordinary async dependencies, streams/iterators, binary fragmentation, aliases,
shared producers, request isolation, cancellation, and transport failure. Unused
native weak promises remain pending on EOF or failure. Production-path probes use
`createRenderUtils` to verify EOF and transport cancellation. The renderer-level
request-abort probe supplies an AbortSignal; `renderRsc` itself has no signal
option.

Router cache probes use `serializeRsc` and the matched Flight decoder to check
immutable serialized outcomes (including nested cancellation), dynamic retry
and routing intents, and cancellation-like text and binary data. A factory that
throws produces no serialized result and leaves no cache entry.

The SSR probe runs the RSC renderer in a separate process with the `react-server`
condition. The parent uses the matched React DOM server and Flight decoder with
normal conditions. It verifies an HTML shell precedes late redirects/not-found
and that observing Flight EOF lets unused intents finish HTML rendering. A
control verifies that directly suspending on an unused native weak promise
keeps HTML pending.

The EOF observer in the SSR fixture is illustrative lifecycle handling, not a
new public API or integrated Router change. Waku browser integration is covered by the route-intent and weak-promise E2E fixtures.
