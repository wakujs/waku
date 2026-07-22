import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Modules that evaluate the RSC *client* protocol. Anything an rsc-environment
// entry reaches through a chain of static imports is paying for the client
// runtime at startup, which is what this guard exists to prevent.
const CLIENT_RUNTIME_SPECIFIERS = [
  'react-server-dom-webpack/client.edge',
  '@vitejs/plugin-rsc/rsc/client',
  '@vitejs/plugin-rsc/react/rsc/client',
  // The combined entries re-export the client half, so importing one of them is
  // equivalent to importing the client runtime directly.
  '@vitejs/plugin-rsc/rsc',
  '@vitejs/plugin-rsc/react/rsc',
];

// Every module a Waku app can load in the rsc environment. None of them may
// reach the client runtime through static imports.
const RSC_ENTRIES = [
  'adapter-builders.ts',
  'main.react-server.ts',
  'server.ts',
  'minimal/server.ts',
  'router/server.ts',
  'lib/vite-entries/entry.server.tsx',
  'lib/vite-entries/entry.build.ts',
];

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// Matches static `import ... from '...'` and `export ... from '...'` only.
// Dynamic `import('...')` is deliberately not matched: deferring the client
// runtime behind a dynamic import is the mechanism under test, not a leak.
const STATIC_IMPORT_RE =
  /(?:^|[\s;}])(?:import|export)\s(?:[\s\S]*?\sfrom\s)?['"]([^'"]+)['"]/g;

const resolveRelative = (fromFile: string, specifier: string) => {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = base.endsWith('.js')
    ? [base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')]
    : [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const rel = (file: string) =>
  path.relative(SRC, file).replaceAll(path.sep, '/');

/** Walks the static import graph of `entry` within `src`. */
const walkStaticGraph = (entry: string) => {
  const modules = new Set<string>();
  const clientRuntimeImporters = new Set<string>();
  const queue = [path.join(SRC, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (modules.has(rel(file))) {
      continue;
    }
    modules.add(rel(file));
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(STATIC_IMPORT_RE)) {
      const specifier = match[1]!;
      if (CLIENT_RUNTIME_SPECIFIERS.includes(specifier)) {
        clientRuntimeImporters.add(rel(file));
      } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = resolveRelative(file, specifier);
        expect(
          resolved,
          `unresolved import ${specifier} in ${rel(file)}`,
        ).toBeTruthy();
        queue.push(resolved!);
      }
    }
  }
  return { modules, clientRuntimeImporters };
};

describe('rsc environment does not statically load the RSC client runtime', () => {
  test.for(RSC_ENTRIES)('%s', (entry) => {
    expect([...walkStaticGraph(entry).clientRuntimeImporters]).toEqual([]);
  });

  // Without this, the suite above would still pass if the walk silently stopped
  // traversing. `server.ts` holds the lazy `import()` of the client runtime, so
  // reaching it proves the guard inspects the module that would regress first.
  test('the walk reaches the module that defers the client runtime', () => {
    const { modules } = walkStaticGraph('router/server.ts');
    expect(modules).toContain('router/define-router-utils/element-cache.ts');
    expect(modules).toContain('server.ts');
    expect(modules.size).toBeGreaterThan(20);
  });

  test('a static client runtime import would be detected', () => {
    // Guards the matcher itself: `server.ts` defers the decoder, so turning that
    // dynamic import back into a static one must fail the assertions above.
    const source = fs.readFileSync(path.join(SRC, 'server.ts'), 'utf8');
    expect(source).toContain('await import(');
    expect(source).toContain('react-server-dom-webpack/client.edge');
    expect([...walkStaticGraph('server.ts').clientRuntimeImporters]).toEqual(
      [],
    );
  });
});
