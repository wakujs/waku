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

test(allowServerPlugin, async () => {
  const plugin = allowServerPlugin() as any;
  const context = {
    environment: {
      name: 'rsc',
    },
  };
  const input = `\
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
`;
  const output = await plugin.transform.call(context, compileTsx(input));
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
