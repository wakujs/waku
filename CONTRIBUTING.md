# Contributing to Waku

## Prerequisites

- [Node.js](https://nodejs.org/en/download/): see the supported versions in
  [packages/waku/package.json](./packages/waku/package.json)
- [pnpm](https://pnpm.io/installation): see the version in
  [package.json](./package.json)

```shell
pnpm install
```

## Building

Before you start, make sure to build Waku so that the templates can be run.

```shell
pnpm run compile
```

## Start with a template

The `create-waku` starter templates live in the `templates` directory.

```shell
pnpm -F 01_basic dev # to run the default template in dev mode
```

`build` and `start` can be run with the same pattern:

```shell
pnpm -F 01_basic build
pnpm -F 01_basic start
```

More examples can be found in the [waku-examples](https://github.com/wakujs/waku-examples) repository.

## Testing

Run the checks relevant to your changes:

```shell
pnpm run compile
pnpm run test:unit
pnpm run test:lint
pnpm exec playwright install --with-deps
pnpm run e2e
```

End-to-end tests use [Playwright](https://playwright.dev/).

## Trying an experimental version

To try an app with an experimental version of Waku, change the `waku` dependency in the app's `package.json` to `"github:<REPO_OWNER>/waku#<GIT_REF>&path:/packages/waku"` and run `pnpm install`. For example:

```json
{
  "dependencies": {
    "waku": "github:your_username/waku#your_branch&path:/packages/waku"
  }
}
```

---

## Coding rules and conventions

In short, keep changes focused and code direct. Prefer fewer concepts, respect
existing module boundaries, and preserve observable behavior. Public APIs need
explicit types and useful JSDoc; implementation details should generally rely
on inference and avoid narrating comments. Add focused tests for changed
behavior.

Unstable APIs use `_UNSTABLE` for React components, hooks, and contexts,
`Unstable_` for TypeScript types, and `unstable_` for other values and
functions. A deprecated alias keeps the name it shipped with; the
convention applies to the name an API is introduced under. The marker belongs
to the name a package entry point exports. Internal modules use the unmarked
name, and an import from a package entry point may drop the marker, as in
`unstable_createCustomError as createCustomError`.

### For AI agents

If you use a coding agent, configure your local instruction file, such as
`AGENTS.md`, to tell the agent to read this file. Treat the rules below as hard
constraints, not style tips. Here, compression means reducing the concepts a
reader must hold in mind, not making code terse or public documentation
incomplete.

### Scope and design

- Fix behavior in the layer that owns it. Do not spread a special case across
  unrelated modules.
- Keep changes focused. Do not combine a bug fix with an unrelated refactor.
  Prefer a readable diff over either the fewest changed lines or a broad
  cleanup.
- Do not expand the task to improve nearby code. Within production code already
  being changed, fix trivial misleading names or bindings and remove misleading
  or redundant comments. In tests, avoid unrelated cleanup.
- Do not add a public option, generic abstraction, or compatibility layer for
  one exceptional case.
- Repetition alone is not a reason to refactor. A small definition, such as an
  `Elements` type, can repeat across modules while its copies stay consistent
  and readable. Do not add a shared abstraction only to remove duplication.
- Prefer fewer concepts. Every new name, file, or type should represent a
  distinction the code needs, not make the design look complete or symmetric.
- Split a module only at a real boundary, not to move one small helper into its
  own file.
- Preserve existing ordering and other observable contracts unless changing
  them is the purpose of the change.
- Validate external input at its boundary. Do not add speculative guards for
  states already excluded by internal types or invariants.
- Keep Waku core independent from Waku Router. Router-specific integration in
  core should be exceptional and narrowly scoped.
- Keep platform-specific behavior in adapters. Do not import Node APIs into
  browser or isomorphic modules.

### Implementation

- Prefer direct control flow, early returns, and native platform APIs.
- Use `const` unless a binding must be reassigned. Local mutation of an array,
  map, set, or result object is fine when it makes the algorithm clearer.
- Do not create a wrapper that only supplies fixed arguments to another
  function.
- Extract a helper when it owns a meaningful operation or invariant, not merely
  to shorten the caller.
- Do not add refs, contexts, locks, or other coordination state that only
  narrates existing control flow.
- Prefer an early return or thrown error to an outcome union that is consumed
  only once. Use a discriminated union when callers actually branch on its
  states.
- Prefer plain functions and objects. Use a class only when required by a
  framework or platform contract.
- Use recursion when the problem is naturally recursive and the call depth is
  safe.
- Await or return promises. Do not leave asynchronous work floating.
- Normalize configuration and optional inputs once near the boundary.
- Prefer `function` declarations for functions exported for production and
  `const` arrow functions for the rest, including exports only tests use.
- In client code, positional parameters and tuples can be deliberate because
  they minify better than object properties. Do not convert them to objects for
  style alone. In server code, prefer objects unless a tuple has a concrete
  performance or readability benefit.

### Naming

These are defaults. A clear distinction, a native API convention, a name
collision, or client bundle size can justify an exception.

- Give one concept one name, and use it across variables, properties, types,
  and filenames. Do not introduce a synonym for an established term.
- Name functions with verbs. A component, Vite plugin factory, middleware, or
  RSC enhancer is named for its role.
- Name operations and results, not stages in the control flow. Avoid helpers and
  variables that only narrate the current step.
- Name a map or record that looks up values by key `valuesByKey`, with words
  that say what the keys and values are, such as `runtimeSliceById`.
- Name a conversion `aToB`, not `a2b`.
- Use full words in public APIs and outer scopes, such as `options` rather than
  `opts`. Inner scopes may use short names, and short names in client code can
  be deliberate. Do not lengthen them only to be explicit.
- Avoid shadowing an outer binding.
- Import a binding under its exported name. Rename an import only to resolve a
  real collision or to drop an unstable marker.
- An export that exists only for tests ends in `ForTest`, or `_FOR_TEST` for a
  constant. When the module also uses the binding, keep its plain name and add
  a separate exported declaration next to it, such as
  `export const doFooForTest = doFoo;`, `export const FOO_FOR_TEST = FOO;`, or
  `export type FooForTest = Foo;`. Do not add the suffix with an export alias.
- Name a component module in kebab case after its component, such as
  `foo-bar.tsx` for `FooBar`. Files whose names define routes follow the
  router's file conventions.

### Terminology

Use these terms for the concepts they name. Native browser, HTTP, React, and
Vite APIs keep their own names.

Router concepts:

- A route is the `path`, `query`, and `hash` that a router renders.
- A page is declared with `createPage` in `createPages`. Pages and their
  layouts produce routes.
- A router definition, `RouterDefinition`, is what a server router resolves a
  route to: the elements to render and how to render them.
- Router state is the control metadata for changing routes, such as history,
  scrolling, and redirect follows.
- Navigation is the operation of changing the route. Name operations and their
  records after it, not route data.
- Location means only the native concept, such as `window.location` or the HTTP
  `Location` header. It is not another word for a route.

Paths and URLs:

- `pathname` is a URL path with the base path removed. `rawPathname` is
  `URL.pathname` as received, with the base path. Neither is percent-decoded.
- `routePath` is a `pathname` normalized for routing, without a trailing slash
  or `/index.html`.
- `pathPattern` is a declared path template, such as `/posts/[id]` or
  `/(group)/about`.
- `pathSpec` is a parsed path or path pattern, as an array of segments.
- `rscPath` identifies an RSC request, such as `R/posts/1`. It is not a URL
  path. `formatRscUrl` builds the URL that requests it.
- `url` holds a `URL` object.
- `href` is a URL string in the form an `<a href>` accepts, resolved against
  the document URL. A root-relative `href` must already include the base path
  to point inside the app.
- `routeHref` is a path with its query and hash, without the base path, such
  as `/posts/1?tab=a#top`. A query or hash alone, such as `?tab=a`, applies to
  the current route. `createRouteHref` returns route hrefs.
- `query` is a serialized query string without the leading `?`.
  `searchParams` is a `URLSearchParams`. `search` is the data a search codec
  parses from the query, and `searchCodec` is the codec.
- `filePath` is a file path with forward slashes, as Vite uses. `fileURL` is a
  `file:` URL for `import()`, and `osPath` is the platform path for `node:fs`.

Server functions:

- `serverFunctionId` is the `<module>#<export>` string that identifies a server
  function. A local `id` is fine when nothing else in scope has an id.
- Action means the form action protocol, where a form submission is decoded
  with `decodeAction` and `decodeFormState`. Do not use it for every server
  function call.

Verbs at the start of a function name:

- `get`: lightweight access or derivation, without I/O or substantial work.
- `find`: search candidates in order.
- `fetch`: send an HTTP request through the native `fetch`.
- `read`: consume stored data or a stream. Decoding its format is part of
  reading.
- `load`: prepare something for use by reading, importing, resolving,
  initializing, or caching it.
- `create`: construct a new value, object, or closure. Use it instead of
  `make`.
- `build`: assemble a result from many parts, or render it. As a noun, build
  means the production build.

### TypeScript

- Prefer inference for local implementation details and explicit types for
  public contracts or important boundaries.
- Prefer `unknown` to `any`. Narrow values before using them.
- Prefer type aliases. Use interfaces when declaration merging or augmentation
  is required.
- Keep casts narrow and close to third-party or framework boundaries. Do not
  weaken types throughout the caller to satisfy one integration point.
- Use `import type` for type-only imports.

### Comments and documentation

Before adding a comment, look for a better home, in this order:

1. A name: rename the binding, constant, or function, or split the function.
2. A test: an edge case that a regression test pins down needs no comment.
3. A guide: motivation and design belong in the docs.
4. The commit message: anything about how the code changed.

- Comment only what none of these homes can carry. A comment explains code
  that exists: why this branch exists, which invariant the code next to it
  relies on, or which external behavior forces a workaround. Fitting one of
  these is required, not sufficient.
- Do not explain code that is not there. Why something was removed or is not
  done belongs in the commit message, and a regression test should guard it.
- Write for the code as it stands. Read the comment as someone who never saw
  the previous version: words like "either", "still", "no longer", "instead",
  or "like any other" mean it describes the change, not the code.
- Keep a comment to one line, rarely two. A comment that needs a paragraph
  belongs in one of the homes above.
- The rules above apply equally to tests, fixtures, and e2e specs.
- Do not restate a name or type, in a comment or in JSDoc, and do not repeat
  the same fact in multiple places.
- `TODO`, `FIXME`, and `HACK` are acceptable when they describe an unresolved
  issue. Remove them only when the issue is actually resolved.
- Public APIs should have complete JSDoc suitable for editor documentation.
  Cover the behavior, parameters, return values, caveats, and examples needed to
  use the API correctly, in as few lines as that takes. A caller should be able
  to read it in one pass. Explain what a caller must know, not how the
  implementation arrives there. Documentation that grows past a screenful
  usually means the API needs splitting rather than more prose.
- Public unstable APIs should have the same useful editor documentation as
  other public APIs.
- An exported symbol is not necessarily a public API. JSDoc is editor
  documentation for callers, so a symbol no public entry point exposes gets
  none; comment it like any other code.

### Tests

- Reproduce a reported bug before describing it as confirmed.
- Every regression test must fail when its production fix is removed.
- Test observable behavior. Prefer a real existing fixture or integration
  boundary to a loose mock.
- Prefer a few cases at important behavioral boundaries to a scenario matrix
  that mirrors implementation branches.
- Do not change an existing assertion merely to make a new fixture case fit.
