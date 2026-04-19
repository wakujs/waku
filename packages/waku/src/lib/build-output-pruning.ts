import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rm } from 'node:fs/promises';
import {
  BUILD_METADATA_FILE,
  DIST_SERVER,
  UNSTABLE_PRUNABLE_SOURCE_FILES_METADATA_KEY,
} from './constants.js';
import { joinPath } from './utils/path.js';

type OutputChunk = {
  type: 'chunk';
  isEntry: boolean;
  name: string;
  fileName: string;
  code: string;
  imports: string[];
  dynamicImports: string[];
  referencedFiles?: string[];
  modules?: Record<string, unknown>;
};

type OutputBundle = Record<string, OutputChunk | { type: 'asset' }>;

type OutputNode = {
  imports: Set<string>;
  dynamicImports: Set<string>;
  referencedFiles: Set<string>;
};

export type BuildOutputGraph = {
  entryFiles: Map<string, string>;
  nodes: Map<string, OutputNode>;
  pageLoaderChunks: Map<string, string[]>;
};

const normalizeFileName = (fileName: string) =>
  fileName.startsWith('./') ? fileName.slice(2) : fileName;

const normalizeMetadataChunkFile = (serverDir: string, fileName: string) => {
  if (fileName.startsWith('file://')) {
    return normalizeFileName(path.relative(serverDir, fileURLToPath(fileName)));
  }
  return path.isAbsolute(fileName)
    ? normalizeFileName(path.relative(serverDir, fileName))
    : normalizeFileName(fileName);
};

const getOrCreateNode = (graph: BuildOutputGraph, fileName: string) => {
  const normalized = normalizeFileName(fileName);
  let node = graph.nodes.get(normalized);
  if (!node) {
    node = {
      imports: new Set(),
      dynamicImports: new Set(),
      referencedFiles: new Set(),
    };
    graph.nodes.set(normalized, node);
  }
  return node;
};

export const collectBuildOutputGraph = (
  bundle: OutputBundle,
): BuildOutputGraph => {
  const graph: BuildOutputGraph = {
    entryFiles: new Map(),
    nodes: new Map(),
    pageLoaderChunks: new Map(),
  };
  for (const item of Object.values(bundle)) {
    if (item.type !== 'chunk') {
      continue;
    }
    const node = getOrCreateNode(graph, item.fileName);
    item.imports.forEach((fileName) =>
      node.imports.add(normalizeFileName(fileName)),
    );
    item.dynamicImports.forEach((fileName) =>
      node.dynamicImports.add(normalizeFileName(fileName)),
    );
    item.referencedFiles?.forEach((fileName) =>
      node.referencedFiles.add(normalizeFileName(fileName)),
    );
    if (item.isEntry) {
      graph.entryFiles.set(item.name, normalizeFileName(item.fileName));
    }
    for (const match of item.code.matchAll(
      /['"`](\.\/[^'"`\s]+\.[^'"`\s]+)['"`]\s*:\s*\(\)\s*=>\s*import\((['"`])([^'"`\s]+\.(?:js|mjs|cjs))\2\)/g,
    )) {
      const sourceFile = match[1];
      if (!sourceFile) {
        continue;
      }
      const chunkFile = normalizeFileName(
        path.posix.join(path.posix.dirname(item.fileName), match[3]!),
      );
      const existing = graph.pageLoaderChunks.get(sourceFile) || [];
      existing.push(chunkFile);
      graph.pageLoaderChunks.set(sourceFile, existing);
    }
  }
  return graph;
};

const collectReachableFiles = (
  graph: BuildOutputGraph,
  roots: Iterable<string>,
  pageRootFiles: ReadonlySet<string>,
) => {
  const reachableFiles = new Set<string>();
  const visit = (fileName: string) => {
    const normalized = normalizeFileName(fileName);
    if (reachableFiles.has(normalized)) {
      return;
    }
    reachableFiles.add(normalized);
    const node = graph.nodes.get(normalized);
    if (!node) {
      return;
    }
    node.imports.forEach(visit);
    node.referencedFiles.forEach(visit);
    node.dynamicImports.forEach((dynamicImport) => {
      if (pageRootFiles.has(dynamicImport)) {
        return;
      }
      visit(dynamicImport);
    });
  };
  for (const root of roots) {
    visit(root);
  }
  return reachableFiles;
};

const loadBuildMetadataMap = async ({
  rootDir,
  distDir,
}: {
  rootDir: string;
  distDir: string;
}) => {
  const serverDir = joinPath(rootDir, distDir, DIST_SERVER);
  const buildMetadataPath = joinPath(serverDir, BUILD_METADATA_FILE);
  const mod = (await import(
    `${pathToFileURL(buildMetadataPath).href}?t=${Date.now()}`
  )) as {
    buildMetadata?: Map<string, string>;
  };
  return mod.buildMetadata ?? new Map<string, string>();
};

export const pruneRscBuildOutputs = async ({
  rootDir,
  distDir,
  graph,
}: {
  rootDir: string;
  distDir: string;
  graph: BuildOutputGraph;
}) => {
  const serverDir = joinPath(rootDir, distDir, DIST_SERVER);
  const buildMetadata = await loadBuildMetadataMap({ rootDir, distDir });
  const prunablePageFiles = new Set<string>(
    JSON.parse(
      buildMetadata.get(UNSTABLE_PRUNABLE_SOURCE_FILES_METADATA_KEY) || '[]',
    ),
  );

  const pageRootFiles = new Set(
    Array.from(graph.pageLoaderChunks.values()).flatMap((fileNames) =>
      fileNames.map((fileName) =>
        normalizeMetadataChunkFile(serverDir, fileName),
      ),
    ),
  );
  const prunedPageRoots = new Set(
    Array.from(graph.pageLoaderChunks.entries())
      .filter(([file]) => prunablePageFiles.has(file))
      .flatMap(([, fileNames]) =>
        fileNames.map((fileName) =>
          normalizeMetadataChunkFile(serverDir, fileName),
        ),
      ),
  );

  const buildEntryFile = graph.entryFiles.get('build');
  const keepRoots = [
    ...Array.from(graph.entryFiles.values()).filter(
      (fileName) => fileName !== buildEntryFile,
    ),
    ...Array.from(pageRootFiles).filter(
      (fileName) => !prunedPageRoots.has(fileName),
    ),
  ];
  const pruneRoots = [
    ...Array.from(prunedPageRoots),
    ...(buildEntryFile ? [buildEntryFile] : []),
  ];

  const keepFiles = collectReachableFiles(graph, keepRoots, pageRootFiles);
  const pruneFiles = collectReachableFiles(graph, pruneRoots, pageRootFiles);
  const filesToDelete = Array.from(pruneFiles).filter(
    (fileName) =>
      !keepFiles.has(fileName) &&
      fileName !== normalizeFileName(BUILD_METADATA_FILE),
  );

  await Promise.all(
    filesToDelete.map((fileName) =>
      rm(joinPath(serverDir, fileName), { force: true }),
    ),
  );
};
