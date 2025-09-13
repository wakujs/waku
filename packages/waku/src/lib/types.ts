import type { ReactNode } from 'react';

import type { Config } from '../config.js';

type Elements = Record<string, unknown>;

type RenderRsc = (elements: Record<string, unknown>) => Promise<ReadableStream>;

type RenderHtml = (
  elements: Elements,
  html: ReactNode,
  options: { rscPath: string; actionResult?: unknown; status?: number },
) => Promise<Response>;

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
        pathname: string;
      }
    | { type: 'custom'; pathname: string }
  ) & {
    req: Request;
  },
  utils: {
    renderRsc: RenderRsc;
    renderHtml: RenderHtml;
  },
) => Promise<ReadableStream | Response | 'fallback' | null | undefined>;

export type Unstable_HandleBuild = (utils: {
  renderRsc: RenderRsc;
  renderHtml: RenderHtml;
  rscPath2pathname: (rscPath: string) => string;
  generateFile: (
    pathname: string,
    body: Promise<ReadableStream | string>,
  ) => Promise<void>;
  generateDefaultHtml: (pathname: string) => Promise<void>;
}) => Promise<void>;

export type Unstable_MiddlewareArgs = {
  processRequest: (req: Request) => Promise<Response | null>;
  config: Omit<Required<Config>, 'vite'>;
  isBuild: boolean;
};

export type Unstable_CreateFetch = (
  args: Unstable_MiddlewareArgs,
) => (req: Request) => Promise<Response>;

export type Unstable_ServerEntry = {
  default: {
    handleRequest: Unstable_HandleRequest;
    handleBuild: Unstable_HandleBuild;
    createFetch: Unstable_CreateFetch;
  };
};

/** @deprecated This will be removed soon. */
export type HandlerContext = {
  req: Request;
  res?: Response;
  readonly data: Record<string, unknown>;
};

/** @deprecated This will be removed soon. */
type Handler = (
  ctx: HandlerContext,
  next: () => Promise<void>,
) => Promise<void>;

/** @deprecated This will be removed soon. */
export type MiddlewareOptions = {
  cmd: 'dev' | 'start';
  env: Record<string, string>;
};

/** @deprecated This will be removed soon. */
export type Middleware = (options: MiddlewareOptions) => Handler;
