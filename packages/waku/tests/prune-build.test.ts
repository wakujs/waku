import { describe, expect, it, vi } from 'vitest';

const writeFile = vi.fn(async (..._args: unknown[]) => {});
const rm = vi.fn(async (..._args: unknown[]) => {});

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
  rm: (...args: unknown[]) => rm(...args),
}));

const { pruneBuildOutput } =
  await import('../src/lib/utils-build/prune-build.js');

type RscBundle = Parameters<typeof pruneBuildOutput>[0]['rscBundle'];

const ROOT = '/proj';
const SRC = 'src';
const DIST = 'dist';

const makeBundle = (
  items: Array<
    | {
        type: 'chunk';
        fileName: string;
        facadeModuleId?: string | null;
        moduleIds?: string[];
        isEntry?: boolean;
        isDynamicEntry?: boolean;
        name?: string;
        imports?: string[];
        dynamicImports?: string[];
        importedAssets?: string[];
        importedCss?: string[];
      }
    | { type: 'asset'; fileName: string }
  >,
): RscBundle => {
  const out: RscBundle = {};
  for (const item of items) {
    if (item.type === 'chunk') {
      out[item.fileName] = {
        type: 'chunk',
        fileName: item.fileName,
        facadeModuleId: item.facadeModuleId ?? null,
        moduleIds: item.moduleIds ?? [],
        isEntry: item.isEntry ?? false,
        isDynamicEntry: item.isDynamicEntry ?? false,
        name: item.name ?? item.fileName.replace(/\..*$/, ''),
        imports: item.imports ?? [],
        dynamicImports: item.dynamicImports ?? [],
        ...(item.importedAssets || item.importedCss
          ? {
              viteMetadata: {
                importedAssets: new Set(item.importedAssets ?? []),
                importedCss: new Set(item.importedCss ?? []),
              },
            }
          : {}),
      };
    } else {
      out[item.fileName] = { type: 'asset', fileName: item.fileName };
    }
  }
  return out;
};

describe('pruneBuildOutput', () => {
  it('deletes assets referenced only by pruned chunks', async () => {
    writeFile.mockClear();
    rm.mockClear();
    const bundle = makeBundle([
      { type: 'chunk', fileName: 'build.js', isEntry: true, name: 'build' },
      // Static page chunk + its CSS asset.
      {
        type: 'chunk',
        fileName: 'static-page.js',
        facadeModuleId: '/proj/src/pages/static.tsx',
        isDynamicEntry: true,
        importedCss: ['static-page.css'],
      },
      { type: 'asset', fileName: 'static-page.css' },
    ]);

    const { stubbedChunks, deletedAssets } = await pruneBuildOutput({
      rootDir: ROOT,
      srcDir: SRC,
      distDir: DIST,
      rscBundle: bundle,
      prunableFiles: ['pages/static.tsx'],
      serverReferenceModuleIds: new Set(),
    });

    expect(stubbedChunks).toContain('static-page.js');
    expect(deletedAssets).toContain('static-page.css');
    expect(rm).toHaveBeenCalledWith(`${ROOT}/${DIST}/server/static-page.css`, {
      force: true,
    });
  });

  it('keeps a static chunk that holds a server function, with its imports', async () => {
    const bundle = makeBundle([
      { type: 'chunk', fileName: 'build.js', isEntry: true, name: 'build' },
      {
        type: 'chunk',
        fileName: 'static-layout.js',
        facadeModuleId: '/proj/src/pages/_layout.tsx',
        moduleIds: ['/proj/src/pages/_layout.tsx'],
        isDynamicEntry: true,
        imports: ['nav.js'],
      },
      { type: 'chunk', fileName: 'nav.js', moduleIds: ['/proj/src/nav.tsx'] },
    ]);

    const { stubbedChunks } = await pruneBuildOutput({
      rootDir: ROOT,
      srcDir: SRC,
      distDir: DIST,
      rscBundle: bundle,
      prunableFiles: ['pages/_layout.tsx'],
      serverReferenceModuleIds: new Set(['/proj/src/pages/_layout.tsx']),
    });

    expect(stubbedChunks).not.toContain('static-layout.js');
    expect(stubbedChunks).not.toContain('nav.js');
  });

  it('keeps assets that are also referenced by a kept chunk', async () => {
    writeFile.mockClear();
    rm.mockClear();
    const bundle = makeBundle([
      { type: 'chunk', fileName: 'build.js', isEntry: true, name: 'build' },
      {
        type: 'chunk',
        fileName: 'static-page.js',
        facadeModuleId: '/proj/src/pages/static.tsx',
        isDynamicEntry: true,
        importedCss: ['shared.css'],
      },
      {
        type: 'chunk',
        fileName: 'dynamic-page.js',
        facadeModuleId: '/proj/src/pages/dynamic.tsx',
        isDynamicEntry: true,
        importedCss: ['shared.css'],
      },
      { type: 'asset', fileName: 'shared.css' },
    ]);

    const { stubbedChunks, deletedAssets } = await pruneBuildOutput({
      rootDir: ROOT,
      srcDir: SRC,
      distDir: DIST,
      rscBundle: bundle,
      prunableFiles: ['pages/static.tsx'],
      serverReferenceModuleIds: new Set(),
    });

    expect(stubbedChunks).toContain('static-page.js');
    expect(deletedAssets).not.toContain('shared.css');
  });
});
