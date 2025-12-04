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

const runTransform = (code: string, environmentName = 'rsc') => {
  const plugin = allowServerPlugin() as any;
  const context = {
    environment: {
      name: environmentName,
    },
  };
  return plugin.transform.call(context, compileTsx(code)) as string | undefined;
};

test('skips transform outside RSC environment', () => {
  const output = runTransform(
    `'use client';\nexport const value = 1;`,
    'client',
  );
  expect(output).toBeUndefined();
});

test('skips files without a use client directive even if the string exists', () => {
  const output = runTransform(
    `const label = "use client";\nexport const value = label;`,
  );
  expect(output).toBeUndefined();
});

test('throws when allowServer receives an unexpected number of arguments', () => {
  expect(() =>
    runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
export const bad = unstable_allowServer(1, 2);
`),
  ).toThrowError('allowServer should have exactly one argument');
});

test('throws when allowServer receives zero arguments', () => {
  expect(() =>
    runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
export const bad = unstable_allowServer();
`),
  ).toThrowError('allowServer should have exactly one argument');
});

test('keeps only allowServer dependencies and removes allowServer imports', () => {
  const output = runTransform(`\
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
`);

  expect(output).toBeDefined();
  expect(output).toContain(`from './helper'`);
  expect(output).not.toContain('waku/client');
  expect(output).toContain('const base = 1;');
  expect(output).toMatch(/function getValue\(x\)/);
  expect(output).toMatch(/export const allowed = getValue\(unused\)/);
  expect(output).toMatch(
    /export const extra = \(\) => \{ throw new Error\('It is not possible to invoke a client function from the server: "extra"'\) \};?/,
  );
});

test('supports allowServer aliasing and export specifiers', () => {
  const output = runTransform(`\
'use client';
import { unstable_allowServer as allow } from 'waku/client';

const value = 42;
const aliasSource = value;
export const result = allow(aliasSource);
export { aliasSource as exposed };
`);

  expect(output).toBeDefined();
  expect(output).not.toContain('waku/client');
  expect(output).toMatch(/const aliasSource = value/);
  expect(output).toMatch(/export const result = aliasSource/);
  expect(output).toMatch(
    /export const exposed = \(\) => \{ throw new Error\('It is not possible to invoke a client function from the server: "exposed"'\) \};?/,
  );
});

test('handles multiple allowServer exports with shared dependencies', () => {
  const output = runTransform(`\
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
`);

  expect(output).toBeDefined();
  expect(output).toContain('const base = 1;');
  expect(output).toMatch(/function timesTwo\(x\)/);
  expect(output).toMatch(/function wrapper\(n\)/);
  expect(output).toContain('export const first = timesTwo;');
  expect(output).toContain('export const second = wrapper;');
  expect(output).not.toContain('unused');
});

test('removes unused allowServer import when never invoked', () => {
  const output = runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
export const value = 1;
`);

  expect(output).toBeDefined();
  expect(output).not.toContain('waku/client');
  expect(output).toMatch(
    /export const value = \(\) => \{ throw new Error\('It is not possible to invoke a client function from the server: "value"'\) \};?/,
  );
});

test('does not require allowServer to come from waku/client', () => {
  const output = runTransform(`\
'use client';
import { unstable_allowServer } from './custom-allow';
const impl = () => "ok";
export const allowed = unstable_allowServer(impl);
`);

  expect(output).toBeDefined();
  expect(output).not.toContain('./custom-allow');
  expect(output).toMatch(/const impl = \(\)\s*=>\s*"ok";?/);
  expect(output).toContain('export const allowed = impl;');
});

test('handles default allowServer export', () => {
  const output = runTransform(`\
'use client';
import { unstable_allowServer } from 'waku/client';
const fn = () => 1;
export default unstable_allowServer(fn);
`);

  expect(output).toBeDefined();
  expect(output).not.toContain('waku/client');
  expect(output).not.toMatch(/fn = \(\)\s*=>\s*1/);
  expect(output).toMatch(
    /export default \(\) => \{ throw new Error\('It is not possible to invoke a client function from the server: "default"'\) \};?/,
  );
});

test('transforms client modules and stubs non-allowServer exports', () => {
  const output = runTransform(`\
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
`);

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
