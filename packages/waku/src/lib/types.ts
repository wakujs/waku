import type { ReactNode } from 'react';
import type { Config } from '../config.js';

type Elements = Record<string, unknown>;

export type Unstable_RenderRsc = (
  elements: Elements,
) => Promise<ReadableStream>;

export type Unstable_ParseRsc = (
  rscStream: ReadableStream,
) => Promise<Elements>;

export type Unstable_RenderHtml = (
  elementsStream: ReadableStream,
  html: ReactNode,
  options: { rscPath: string; formState?: unknown; status?: number; nonce?: string },
) => Promise<Response>;

export type Unstable_EmitFile = (
  filePath: string,
  body: ReadableStream | string,
) => Promise<void>;

export type Unstable_HandleRequest = (
  input: (
    | { type: 'component'; rscPath: string; rscParams: unknown }
    | {
        type: 'function';
        fn: (...args: unknown[]) => Promise<unknown>;
        args: unknown[];
      }
    | {
        type: 'action';
        fn: () => Promise<unknown>;
      }
    | { type: 'custom' }
  ) & {
    pathname: string;
    req: Request;
  },
  utils: {
    renderRsc: Unstable_RenderRsc;
    parseRsc: Unstable_ParseRsc;
    renderHtml: Unstable_RenderHtml;
    loadBuildMetadata: (key: string) => Promise<string | undefined>;
  },
) => Promise<ReadableStream | Response | 'fallback' | null | undefined>;

export type Unstable_HandleBuild = (utils: {
  renderRsc: Unstable_RenderRsc;
  parseRsc: Unstable_ParseRsc;
  renderHtml: Unstable_RenderHtml;
  rscPath2pathname: (rscPath: string) => string;
  saveBuildMetadata: (key: string, value: string) => Promise<void>;
  withRequest: <T>(req: Request, fn: () => T) => T;
  generateFile: (
    fileName: string,
    body: ReadableStream | string,
  ) => Promise<void>;
  generateDefaultHtml: (fileName: string) => Promise<void>;
}) => Promise<void>;

export type Unstable_Handlers = {
  handleRequest: Unstable_HandleRequest;
  handleBuild: Unstable_HandleBuild;
  [someOtherProperty: string]: unknown;
};

export type Unstable_ServerEntry = {
  fetch: (req: Request, ...args: any[]) => Response | Promise<Response>;
  build: (
    utils: {
      emitFile: Unstable_EmitFile;
    },
    ...args: any[]
  ) => Promise<void>;
  buildOptions?: Record<string, unknown>;
  buildEnhancers?: string[]; // enhancer module ids
  [someOtherProperty: string]: unknown;
};

export type Unstable_ProcessRequest = (
  req: Request,
) => Promise<Response | null>;

export type Unstable_ProcessBuild = (utils: {
  emitFile: Unstable_EmitFile;
}) => Promise<void>;

export type Unstable_CreateServerEntryAdapter = <Options>(
  fn: (
    args: {
      handlers: Unstable_Handlers;
      processRequest: Unstable_ProcessRequest;
      processBuild: Unstable_ProcessBuild;
      config: Omit<Required<Config>, 'vite'>;
      isBuild: boolean;
      notFoundHtml: string;
    },
    options?: Options,
  ) => Unstable_ServerEntry,
) => (handlers: Unstable_Handlers, options?: Options) => Unstable_ServerEntry;
