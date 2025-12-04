import * as swc from '@swc/core';
import { expect, test } from 'vitest';
import { allowServerPlugin } from '../src/lib/vite-plugins/allow-server.js';

const compileTsx = (code: string) =>
  swc.transformSync(code, {
    jsc: {
      parser: {
        syntax: 'typescript',
        tsx: true,
      },
      transform: {
        react: { runtime: 'automatic' },
      },
      target: 'esnext',
    },
  }).code;

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
  expect(output).toMatch(/function getValue\\(x\\)/);
  expect(output).toMatch(/export const allowed = getValue\\(unused\\)/);
  expect(output).toMatch(
    /export const extra = \\(\\) => \\{ throw new Error\\('It is not possible to invoke a client function from the server: "extra"'\\) \\};?/,
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
    /export const exposed = \\(\\) => \\{ throw new Error\\('It is not possible to invoke a client function from the server: "exposed"'\\) \\};?/,
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
