import type * as estree from 'estree';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';
import { parseAstAsync } from 'vite';

type ProgramNode = Awaited<ReturnType<typeof parseAstAsync>>;

const VIRTUAL_RUNTIME_ID = 'virtual:vite-rsc-waku/ssr-loader-runtime';

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
  return {
    name: 'waku:vite-plugins:ssr-loader',
    resolveId(source) {
      if (source === VIRTUAL_RUNTIME_ID) {
        return '\0' + source;
      }
    },
    load(id) {
      if (id !== '\0' + VIRTUAL_RUNTIME_ID) {
        return;
      }
      // Note: This relies on Vite's Environment API being exposed through
      // `globalThis.__viteRscDevServer` (provided by @vitejs/plugin-rsc) in dev.
      return `\
export async function loadSsrModule(specifier, importer) {
  const devServer = globalThis.__viteRscDevServer;
  const environment = devServer?.environments?.ssr;
  if (!environment?.runner || !environment?.pluginContainer) {
    throw new Error('[waku] unstable_loadSsrModule is only available during Vite dev');
  }
  const resolved = await environment.pluginContainer.resolveId(specifier, importer);
  if (!resolved) {
    throw new Error('[waku] failed to resolve SSR module: ' + specifier);
  }
  return environment.runner.import(resolved.id);
}
`;
    },
    async transform(code, id) {
      if (this.environment.name !== 'rsc') {
        return;
      }
      if (!code.includes('unstable_loadSsrModule')) {
        return;
      }
      if (this.environment.mode === 'build') {
        this.error(
          '[waku] unstable_loadSsrModule is not supported in build yet (dev-only)',
        );
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
          const argument =
            arg.type === 'SpreadElement' ? arg.argument : (arg as estree.Node);
          const source = getStringArgValue(argument);
          if (!source) {
            this.error(
              '[waku] unstable_loadSsrModule argument must be a string literal',
            );
          }
          s.overwrite(
            node.start,
            node.end,
            `import(${JSON.stringify(VIRTUAL_RUNTIME_ID)}).then((m) => m.loadSsrModule(${JSON.stringify(source)}, ${JSON.stringify(id)}))`,
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
