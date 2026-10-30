import type { ReactNode } from 'react';
import type { Config } from '../config.js';
import type { Etags } from './utils-isomorphic/etags.js';

type Elements = Record<string, unknown>;

/**
 * Serializes slots, an optional server function return value, and validators
 * into a Flight stream.
 */
export type RenderRsc = (
  elements: Elements,
  options?: {
    value?: unknown;
    etags?: Etags;
    unstable_clientModuleCallback?: (ids: string[]) => void;
  },
) => Promise<ReadableStream>;

/** Renders an HTML document using a Flight stream and an HTML tree containing Slots. */
export type RenderHtml = (
  elementsStream: ReadableStream,
  html: ReactNode,
  options: {
    rscPath: string;
    formState?: unknown;
    status?: number;
    nonce?: string;
    unstable_extraScriptContent?: string;
  },
) => Promise<Response>;

export type RenderHtmlFallback = (options?: {
  nonce?: string;
  unstable_extraScriptContent?: string;
}) => Promise<Response>;

export type EmitFile = (
  filePath: string,
  body: ReadableStream,
) => Promise<void>;

/**
 * Dispatches payload, server function, and HTTP requests; return null to leave
 * a request unhandled.
 */
export type HandleRequest = (
  input: (
    | { type: 'rsc'; rscPath: string; rscParams: unknown }
    | {
        type: 'call';
        fn: (...args: unknown[]) => Promise<unknown>;
        args: unknown[];
      }
    | {
        type: 'http';
        tryAction?: () => Promise<
          | { action: true; formState: unknown }
          | { action: false; formData: FormData }
        >;
      }
  ) & {
    pathname: string;
    req: Request;
    etags?: Etags;
  },
  utils: {
    renderRsc: RenderRsc;
    renderHtml: RenderHtml;
    renderHtmlFallback: RenderHtmlFallback;
    loadBuildMetadata: (key: string) => Promise<string | undefined>;
  },
) => Promise<ReadableStream | Response | 'fallback' | null | undefined>;

/** Emits prerendered payloads, HTML and build metadata through the supplied utilities. */
export type HandleBuild = (utils: {
  renderRsc: RenderRsc;
  renderHtml: RenderHtml;
  rscPathToFileName: (rscPath: string) => string;
  saveBuildMetadata: (key: string, value: string) => Promise<void>;
  generateFile: (
    fileName: string,
    body: ReadableStream | string,
  ) => Promise<void>;
  generateDefaultHtml: (
    fileName: string,
    options?: Parameters<RenderHtmlFallback>[0],
  ) => Promise<void>;
  unstable_registerPrunableFile: (srcPath: string) => void;
}) => Promise<void>;

/** Runtime and build handlers passed to a Waku adapter. */
export type Handlers = {
  handleRequest: HandleRequest;
  handleBuild: HandleBuild;
  [someOtherProperty: string]: unknown;
};

/** Complete request and build entry produced by an adapter, or authored directly. */
export type ServerEntry = {
  fetch: (req: Request, ...args: any[]) => Response | Promise<Response>;
  build: (
    utils: {
      emitFile: EmitFile;
      unstable_registerPrunableFile: (srcPath: string) => void;
    },
    ...args: any[]
  ) => Promise<void>;
  buildOptions?: Record<string, unknown>;
  buildEnhancers?: string[]; // enhancer module ids
  defaultExport?: unknown;
  [someOtherProperty: string]: unknown;
};

export type ProcessRequest = (
  arg: Parameters<ServerEntry['fetch']>[0],
) => Promise<Response | null>;

export type ProcessBuild = (
  arg: Parameters<ServerEntry['build']>[0],
) => Promise<void>;

export type CreateServerEntryAdapter = <Options>(
  fn: (
    args: {
      handlers: Handlers;
      processRequest: ProcessRequest;
      processBuild: ProcessBuild;
      unstable_setAllEnv: (newEnv: Readonly<Record<string, unknown>>) => void;
      config: Omit<Required<Config>, 'vite'>;
      isBuild: boolean;
      notFoundHtml: string;
    },
    options?: Options,
  ) => ServerEntry,
) => (handlers: Handlers, options?: Options) => ServerEntry;
