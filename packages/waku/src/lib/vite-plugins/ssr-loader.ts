import crypto from 'node:crypto';
import type * as estree from 'estree';
import MagicString from 'magic-string';
import type { EnvironmentOptions, Plugin } from 'vite';
import { parseAstAsync } from 'vite';

type ProgramNode = Awaited<ReturnType<typeof parseAstAsync>>;

const VIRTUAL_ENTRY_PREFIX = 'virtual:vite-rsc-waku/ssr-loader-entry';

const toEntryName = (key: string) =>
  `ssr_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 12)}`;

const getOrCreateSsrInputMap = (ssrConfig: EnvironmentOptions) => {
  ssrConfig.build ??= {};
  ssrConfig.build.rollupOptions ??= {};
  ssrConfig.build.rollupOptions.input ??= {};
  const input = ssrConfig.build.rollupOptions.input;
  if (typeof input === 'string' || Array.isArray(input)) {
    throw new Error(
      '[waku] ssrLoaderPlugin expects environments.ssr.build.rollupOptions.input to be an object',
    );
  }
  return input;
};

const isNode = (value: unknown): value is estree.Node =>
  typeof (value as { type?: unknown })?.type === 'string'; // heuristic

const isNodeWithRange = (
  node: estree.Node,
): node is estree.Node & { start: number; end: number } =>
  typeof (node as { start?: unknown })?.start === 'number' &&
  typeof (node as { end?: unknown })?.end === 'number';

const findImportedLocalName = (
  mod: ProgramNode,
  source: string,
  importedName: string,
) => {
  for (const item of mod.body) {
    if (
      item.type === 'ImportDeclaration' &&
      item.source.type === 'Literal' &&
      item.source.value === source
    ) {
      for (const specifier of item.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === importedName
        ) {
          return specifier.local.name;
        }
      }
    }
  }
  return null;
};

const getStringArgValue = (arg: estree.Node) => {
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    return arg.value;
  }
  if (
    arg.type === 'TemplateLiteral' &&
    arg.expressions.length === 0 &&
    arg.quasis.length === 1
  ) {
    return arg.quasis[0]!.value.cooked ?? arg.quasis[0]!.value.raw;
  }
  return null;
};

const walk = (node: estree.Node, visit: (node: estree.Node) => void) => {
  visit(node);
  Object.values(node).forEach((value: unknown) => {
    (Array.isArray(value) ? value : [value]).forEach((v: unknown) => {
      if (isNode(v)) {
        walk(v, visit);
      }
    });
  });
};

export function ssrLoaderPlugin(): Plugin {
  const entryKeyToName = new Map<string, string>();
  let ssrInputMap: Record<string, string> | null = null;

  const ensureSsrEntry = (specifier: string, importer: string) => {
    if (!ssrInputMap) {
      throw new Error(
        '[waku] ssrLoaderPlugin requires the `ssr` environment with `build.rollupOptions.input`',
      );
    }
    const entryKey = `${importer}\n${specifier}`;
    const existing = entryKeyToName.get(entryKey);
    if (existing) {
      return existing;
    }

    const toVirtualId = (entryName: string) =>
      `${VIRTUAL_ENTRY_PREFIX}?${new URLSearchParams([
        ['e', entryName],
        ['i', importer],
        ['s', specifier],
      ])}`;

    let entryName = toEntryName(entryKey);
    for (let i = 0; i < 100; i++) {
      const maybeName = i === 0 ? entryName : `${entryName}_${i}`;
      const existingInput = ssrInputMap[maybeName];
      if (!existingInput) {
        entryName = maybeName;
        break;
      }
      if (existingInput === toVirtualId(maybeName)) {
        entryName = maybeName;
        break;
      }
    }

    ssrInputMap[entryName] ??= toVirtualId(entryName);
    entryKeyToName.set(entryKey, entryName);
    return entryName;
  };

  return {
    name: 'waku:vite-plugins:ssr-loader',
    resolveId(source) {
      if (this.environment.name !== 'ssr') {
        return;
      }
      if (
        source === VIRTUAL_ENTRY_PREFIX ||
        source.startsWith(VIRTUAL_ENTRY_PREFIX + '?')
      ) {
        return '\0' + source;
      }
    },
    async load(id) {
      if (this.environment.name !== 'ssr') {
        return;
      }
      if (!id.startsWith('\0' + VIRTUAL_ENTRY_PREFIX)) {
        return;
      }
      const query = id.slice(('\0' + VIRTUAL_ENTRY_PREFIX).length);
      const searchParams = new URLSearchParams(query);
      const entryName = searchParams.get('e');
      const specifier = searchParams.get('s');
      const importer = searchParams.get('i');
      if (!entryName || !specifier || !importer) {
        this.error('[waku] ssrLoaderPlugin invalid virtual entry id');
      }
      // Resolve `specifier` relative to original caller module id.
      // This makes `unstable_loadSsrModule("./foo")` behave like dynamic import from the caller.
      const resolved = await this.resolve(specifier, importer);
      if (!resolved) {
        this.error(
          `[waku] failed to resolve SSR module '${specifier}' from '${importer}'`,
        );
      }
      return `\
import * as mod from ${JSON.stringify(resolved.id)};
export default mod.default;
export * from ${JSON.stringify(resolved.id)};
`;
    },
    configEnvironment(name, environmentConfig) {
      if (name !== 'ssr') {
        return;
      }
      ssrInputMap = getOrCreateSsrInputMap(environmentConfig);
    },
    async transform(code, id) {
      if (this.environment.name !== 'rsc') {
        return;
      }
      if (!code.includes('unstable_loadSsrModule')) {
        return;
      }

      const mod = await parseAstAsync(code, { jsx: true });
      const loadSsrModuleLocal = findImportedLocalName(
        mod,
        'waku/server',
        'unstable_loadSsrModule',
      );
      if (!loadSsrModuleLocal) {
        return;
      }

      const s = new MagicString(code);
      let changed = false;

      walk(mod, (node) => {
        if (!isNodeWithRange(node)) {
          return;
        }
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier' &&
          node.callee.name === loadSsrModuleLocal
        ) {
          if (node.arguments.length !== 1) {
            this.error(
              '[waku] unstable_loadSsrModule must have exactly one argument',
            );
          }
          const arg = node.arguments[0]!;
          const argument = arg.type === 'SpreadElement' ? arg.argument : arg;
          const source = getStringArgValue(argument);
          if (!source) {
            this.error(
              '[waku] unstable_loadSsrModule argument must be a string literal',
            );
          }
          const importer = id.replace(/[?#].*$/, '');
          const entryName = ensureSsrEntry(source, importer);
          s.overwrite(
            node.start,
            node.end,
            `import.meta.viteRsc.loadModule("ssr", ${JSON.stringify(entryName)})`,
          );
          changed = true;
        }
      });

      if (changed) {
        return {
          code: s.toString(),
          map: s.generateMap({ hires: 'boundary' }),
        };
      }
    },
  };
}
