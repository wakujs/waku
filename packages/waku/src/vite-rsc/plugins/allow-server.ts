import type { Plugin } from 'vite';
import * as swc from '@swc/core';
import { transformExportedClientThings } from '../../lib/plugins/vite-plugin-rsc-transform.js';

/*
Apply dead code elimination to preserve only `allowServer` exports.


=== Example input ===

"use client"
import { unstable_allowServer as allowServer } from 'waku/client';
import { atom } from 'jotai/vanilla';
import clientDep from "./client-dep" // 🗑️

const local1 = 1;
export const countAtom = allowServer(atom(local1));

const local2 = 2; // 🗑️
export const MyClientComp = () => <div>hey: {local2} {clientDep}</div> // 🗑️

=== Example output ===

"use client"
import { atom } from 'jotai/vanilla';

const local1 = 1;
export const countAtom = atom(local1);

export const MyClientComp = __waku_no_keep__

*/

export function wakuAllowServerPlugin(): Plugin {
  return {
    name: 'waku:allow-server',
    transform(code) {
      if (this.environment.name !== 'rsc') {
        return;
      }
      if (!code.includes('use client')) {
        return;
      }

      const mod = swc.parseSync(code);
      if (!hasDirective(mod, 'use client')) {
        return;
      }

      const exportNames = transformExportedClientThings(mod, () => '', {
        dceOnly: true,
      });
      let newCode = swc.printSync(mod).code;
      for (const name of exportNames) {
        const value = `() => { throw new Error('It is not possible to invoke a client function from the server: ${JSON.stringify(name)}') }`;
        newCode += `export ${name === 'default' ? name : `const ${name} =`} ${value};\n`;
      }
      return `"use client";` + newCode;
    },
  };
}

function hasDirective(mod: swc.Module, directive: string): boolean {
  for (const item of mod.body) {
    if (item.type === 'ExpressionStatement') {
      if (
        item.expression.type === 'StringLiteral' &&
        item.expression.value === directive
      ) {
        return true;
      }
    }
  }
  return false;
}
