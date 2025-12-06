import ts from 'typescript';
import { expect, test } from 'vitest';
import { allowServerPlugin } from '../src/lib/vite-plugins/allow-server.js';

const compileTsx = (code: string) =>
  ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

const runTransform = async (code: string, environmentName = 'rsc') => {
  const plugin = allowServerPlugin();
  const context = {
    environment: {
      name: environmentName,
    },
  };
  if (!(typeof plugin.transform === 'function')) {
    throw new Error('Plugin transform is not defined');
  }
  const output = await plugin.transform.call(
    context as never,
    code,
    'dummy id',
  );
  return output;
};

test('skips transform outside RSC environment', async () => {
  const output = await runTransform(
    `\
'use client';
export const value = 1;
`,
    'client',
  );
  expect(output).toBeUndefined();
});

test('skips files without a use client directive even if the string exists', async () => {
  const output = await runTransform(
    `\
const label = "use client";
export const value = label;
`,
  );
  expect(output).toBeUndefined();
});

test('throws when allowServer receives an unexpected number of arguments', async () => {
  await expect(
    runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
export const bad = unstable_allowServer(1, 2);
`),
  ).rejects.toThrowError('allowServer should have exactly one argument');
});

test('throws when allowServer receives zero arguments', async () => {
  await expect(
    runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
export const bad = unstable_allowServer();
`),
  ).rejects.toThrowError('allowServer should have exactly one argument');
});

test('keeps only allowServer dependencies and removes allowServer imports', async () => {
  const output = await runTransform(
    compileTsx(`\
'use client';

import { helper } from './helper';
import { unstable_allowServer as allowServer } from 'waku/client';

const base = 1;
function getValue(x: number) {
  return helper(x + base);
}

const unused = 123;
export const allowed = allowServer(getValue(unused));
export const extra = 'client';
`),
  );

  expect(output).toMatchInlineSnapshot(`
    ""use client";import { helper } from './helper';
    const base = 1;
    function getValue(x) {
        return helper(x + base);
    }
    const unused = 123;
    export const allowed = getValue(unused);
    export const extra = () => { throw new Error('It is not possible to invoke a client function from the server: "extra"') };
    "
  `);
});

test('supports allowServer aliasing and export specifiers', async () => {
  const output = await runTransform(`\
"use client";
import { unstable_allowServer as allow } from 'waku/client';

const value = 42;
const aliasSource = value;
export const result = allow(aliasSource);
export { aliasSource as exposed };
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";const value = 42;
    const aliasSource = value;
    export const result = aliasSource;
    export const exposed = () => { throw new Error('It is not possible to invoke a client function from the server: "exposed"') };
    "
  `);
});

test('handles multiple allowServer exports with shared dependencies', async () => {
  const output = await runTransform(
    compileTsx(`\
'use client';
import { unstable_allowServer as allowServer } from 'waku/client';

const base = 1;
function timesTwo(x: number) {
  return x * 2 + base;
}
function wrapper(n: number) {
  return timesTwo(n) + base;
}

const unused = 'drop me';
export const first = allowServer(timesTwo);
export const second = allowServer(wrapper);
`),
  );

  expect(output).toMatchInlineSnapshot(`
    ""use client";const base = 1;
    function timesTwo(x) {
        return x * 2 + base;
    }
    function wrapper(n) {
        return timesTwo(n) + base;
    }
    export const first = timesTwo;
    export const second = wrapper;
    "
  `);
});

test('removes unused allowServer import when never invoked', async () => {
  const output = await runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
export const value = 1;
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";export const value = () => { throw new Error('It is not possible to invoke a client function from the server: "value"') };
    "
  `);
});

test('does not require allowServer to come from waku/client', async () => {
  const output = await runTransform(`\
'use client';
import { unstable_allowServer } from './custom-allow';
const impl = () => "ok";
export const allowed = unstable_allowServer(impl);
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";const impl = () => "ok";
    export const allowed = impl;
    "
  `);
});

test('handles default allowServer export', async () => {
  const output = await runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
const fn = () => 1;
export default unstable_allowServer(fn);
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";export default () => { throw new Error('It is not possible to invoke a client function from the server: "default"') };
    "
  `);
});

test('stubs default exports while preserving allowServer dependencies', async () => {
  const output = await runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
const runner = () => "ok";
const other = 123;
export default unstable_allowServer(runner);
export const extra = other;
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";export default () => { throw new Error('It is not possible to invoke a client function from the server: "default"') };
    export const extra = () => { throw new Error('It is not possible to invoke a client function from the server: "extra"') };
    "
  `);
});

test('removes re-exports and stubs them while keeping allowServer deps', async () => {
  const output = await runTransform(`\
'use client';
export { helper } from './helper';
import { unstable_allowServer as allowServer } from 'waku/client';

const base = 5;
function build() { return base; }

export const ok = allowServer(build);
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";const base = 5;
    function build() { return base; }
    export const ok = build;
    export const helper = () => { throw new Error('It is not possible to invoke a client function from the server: "helper"') };
    "
  `);
});

test('stubs bare named exports that are not allowServer', async () => {
  const output = await runTransform(`\
'use client';
const local = 1;
export { local };
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";export const local = () => { throw new Error('It is not possible to invoke a client function from the server: "local"') };
    "
  `);
});

test('stubs bare named exports even when backing value uses allowServer', async () => {
  const output = await runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
const impl = () => 'ok';
const allowed = unstable_allowServer(impl);
export { allowed };
`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";const impl = () => 'ok';
    export const allowed = impl;
    "
  `);
});

test('transforms client modules and stubs non-allowServer exports', async () => {
  const output = await runTransform(
    compileTsx(`\
'use client';

import { Component, createContext, useContext, memo } from 'react';
import { atom } from 'jotai/vanilla';
import { unstable_allowServer as allowServer } from 'waku/client';

const initialCount = 1;
const TWO = 2;
function double (x: number) {
  return x * TWO;
}
export const countAtom = allowServer(atom(double(initialCount)));

export const Empty = () => null;

function Private() {
  return "Secret";
}
const SecretComponent = () => <p>Secret</p>;
const SecretFunction = (n: number) => 'Secret' + n;

export function Greet({ name }: { name: string }) {
  return <>Hello {name}</>;
}

export class MyComponent extends Component {
  render() {
    return <p>Class Component</p>;
  }
}

const MyContext = createContext();

export const useMyContext = () => useContext(MyContext);

const MyProvider = memo(MyContext);

export const NAME = 'World';

export default function App() {
  return (
    <MyProvider value="Hello">
      <div>Hello World</div>
    </MyProvider>
  );
}
`),
  );

  expect(output).toMatchInlineSnapshot(`
    ""use client";import { atom } from 'jotai/vanilla';
    const initialCount = 1;
    const TWO = 2;
    function double(x) {
        return x * TWO;
    }
    export const countAtom = atom(double(initialCount));
    export const Empty = () => { throw new Error('It is not possible to invoke a client function from the server: "Empty"') };
    export const Greet = () => { throw new Error('It is not possible to invoke a client function from the server: "Greet"') };
    export const MyComponent = () => { throw new Error('It is not possible to invoke a client function from the server: "MyComponent"') };
    export const useMyContext = () => { throw new Error('It is not possible to invoke a client function from the server: "useMyContext"') };
    export const NAME = () => { throw new Error('It is not possible to invoke a client function from the server: "NAME"') };
    export default () => { throw new Error('It is not possible to invoke a client function from the server: "default"') };
    "
  `);
});

test('transforms with trailing comment without new lines', async () => {
  const output = await runTransform(`\
'use client';
export const foo = 1;
// some comment`);

  expect(output).toMatchInlineSnapshot(`
    ""use client";// some comment
    export const foo = () => { throw new Error('It is not possible to invoke a client function from the server: "foo"') };
    "
  `);
});
