import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Modules that evaluate the RSC *client* protocol. Anything reachable from an
// rsc-environment entry through a static import chain to one of these is paying
// for the client runtime at startup, which is what #2216 exists to prevent.
const CLIENT_RUNTIME_SPECIFIERS = [
  'react-server-dom-webpack/client.edge',
  '@vitejs/plugin-rsc/rsc/client',
  '@vitejs/plugin-rsc/react/rsc/client',
  // The combined entries re-export the client half, so importing them is
  // equivalent to importing the client runtime directly.
  '@vitejs/plugin-rsc/rsc',
  '@vitejs/plugin-rsc/react/rsc',
];

const SRC = fileURLToPath(new URL('../src', import.meta.url));

// Every module a Waku app can load in the rsc environment, mapped to the
// modules in its static import graph that are allowed to pull the client
// runtime. An empty array means the graph must be entirely client-free.
const RSC_ENTRIES: Record<string, string[]> = {
  'adapter-builders.ts': [],
  'main.react-server.ts': [],
  'server.ts': [],
  'minimal/server.ts': [],
  'lib/vite-entries/entry.server.tsx': [],
  'lib/vite-entries/entry.build.ts': [],
  'rsc/serialize.ts': [],
  // The dedicated decoder entry is the one place that may evaluate it.
  'rsc/deserialize.ts': ['rsc/deserialize.ts'],
  // The built-in router deserializes cached elements through the element
  // cache, so it reaches the decoder by way of that entry.
  'router/server.ts': ['rsc/deserialize.ts'],
};

const IMPORT_RE =
  /(?:^|[\s;}])(?:import|export)\s(?:[\s\S]*?\sfrom\s)?['"]([^'"]+)['"]/g;

const resolveRelative = (fromFile: string, specifier: string) => {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = base.endsWith('.js')
    ? [base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')]
    : [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

/** Modules in the static import graph of `entry` that import a client runtime. */
const findClientRuntimeImporters = (entry: string) => {
  const seen = new Set<string>();
  const importers = new Set<string>();
  const queue = [path.join(SRC, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1]!;
      if (CLIENT_RUNTIME_SPECIFIERS.includes(specifier)) {
        importers.add(path.relative(SRC, file).replaceAll(path.sep, '/'));
      } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = resolveRelative(file, specifier);
        expect(
          resolved,
          `unresolved import ${specifier} in ${file}`,
        ).toBeTruthy();
        queue.push(resolved!);
      }
    }
  }
  return [...importers].sort();
};

describe('rsc environment does not statically load the RSC client runtime', () => {
  test.for(Object.entries(RSC_ENTRIES))('%s', ([entry, expected]) => {
    expect(findClientRuntimeImporters(entry)).toEqual(expected);
  });

  test('the guard actually detects a client runtime import', () => {
    // Sanity check: the decoder entry is found, so an empty result elsewhere
    // means "clean" rather than "the scan silently matched nothing".
    expect(findClientRuntimeImporters('rsc/deserialize.ts')).toContain(
      'rsc/deserialize.ts',
    );
  });
});
