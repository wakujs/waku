import { rm } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { DIST_SERVER } from '../constants.js';
import { joinPath } from '../utils/path.js';

export type RscBuildOutputState = {
  runtimeFiles: Set<string>;
  buildFiles: Set<string>;
};

export const createRscBuildOutputState = (): RscBuildOutputState => ({
  runtimeFiles: new Set(),
  buildFiles: new Set(),
});

type OutputChunk = {
  type: 'chunk';
  isEntry: boolean;
  name: string;
  fileName: string;
  imports: string[];
  dynamicImports: string[];
  referencedFiles?: string[];
};

type OutputBundle = Record<string, OutputChunk | { type: 'asset' }>;

const getEntryChunk = (
  bundle: OutputBundle,
  name: string,
): OutputChunk | undefined =>
  Object.values(bundle).find(
    (item): item is OutputChunk =>
      item.type === 'chunk' && item.isEntry && item.name === name,
  );

const collectReachableFiles = (
  bundle: OutputBundle,
  entryChunk: OutputChunk,
): Set<string> => {
  const reachableFiles = new Set<string>();
  const visit = (fileName: string) => {
    if (reachableFiles.has(fileName)) {
      return;
    }
    reachableFiles.add(fileName);
    const chunkOrAsset = bundle[fileName];
    if (!chunkOrAsset || chunkOrAsset.type !== 'chunk') {
      return;
    }
    chunkOrAsset.imports.forEach(visit);
    chunkOrAsset.dynamicImports.forEach(visit);
    chunkOrAsset.referencedFiles?.forEach(visit);
  };
  visit(entryChunk.fileName);
  return reachableFiles;
};

export const trackRscBuildOutputsPlugin = (
  state: RscBuildOutputState,
): Plugin => ({
  name: 'waku:vite-plugins:track-rsc-build-outputs',
  generateBundle(_options, bundle) {
    const runtimeEntry = getEntryChunk(bundle, 'index');
    const buildEntry = getEntryChunk(bundle, 'build');
    if (!runtimeEntry || !buildEntry) {
      return;
    }
    state.runtimeFiles = collectReachableFiles(bundle, runtimeEntry);
    state.buildFiles = collectReachableFiles(bundle, buildEntry);
  },
});

export const pruneRscBuildOutputs = async ({
  rootDir,
  distDir,
  state,
}: {
  rootDir: string;
  distDir: string;
  state: RscBuildOutputState;
}) => {
  const buildOnlyFiles = [...state.buildFiles].filter(
    (fileName) => !state.runtimeFiles.has(fileName),
  );
  await Promise.all(
    buildOnlyFiles.map((fileName) =>
      rm(joinPath(rootDir, distDir, DIST_SERVER, fileName), { force: true }),
    ),
  );
};
