import path from 'node:path';
// import { createServer as createViteServer } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import * as swc from '@swc/core';

export function rscAnalyzePlugin(
  clientFileSet: Set<string>,
  serverFileSet: Set<string>,
): Plugin {
  const dependencyMap = new Map<string, Set<string>>();
  const clientEntryCallback = (id: string) => clientFileSet.add(id);
  const serverEntryCallback = (id: string) => serverFileSet.add(id);
  const dependencyCallback = (id: string, depId: string) => {
    let depSet = dependencyMap.get(id);
    if (!depSet) {
      depSet = new Set();
      dependencyMap.set(id, depSet);
    }
    depSet.add(depId);
  };
  // let viteClientServer: ViteDevServer;

  return {
    name: 'rsc-analyze-plugin',
    async transform(code, id) {
      // let type: 'agnostic' | 'server-component' | 'client-component' =
      //   'agnostic';
      const ext = path.extname(id);
      if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)) {
        const mod = swc.parseSync(code, {
          syntax: ext === '.ts' || ext === '.tsx' ? 'typescript' : 'ecmascript',
          tsx: ext === '.tsx',
        });
        for (const item of mod.body) {
          if (
            item.type === 'ExpressionStatement' &&
            item.expression.type === 'StringLiteral'
          ) {
            if (item.expression.value === 'use client') {
              // type = 'client-component';
              clientEntryCallback(id);
            } else if (item.expression.value === 'use server') {
              // type = 'server-component';
              serverEntryCallback(id);
            } else {
              // type = 'agnostic';
            }
          }

          if (item.type === 'ImportDeclaration') {
            const resolvedId = await this.resolve(item.source.value, id);
            if (resolvedId) {
              dependencyCallback(id, resolvedId.id);
            }
          }
        }
      }
      return code;
    },
  };
}
