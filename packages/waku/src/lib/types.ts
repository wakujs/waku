import type { ReactNode } from 'react';

type Elements = Record<string, unknown>;

type RenderRsc = (elements: Record<string, unknown>) => Promise<ReadableStream>;

type RenderHtml = (
  elements: Elements,
  html: ReactNode,
  options: { rscPath: string; actionResult?: unknown; status?: number },
) => Promise<Response>;

// This API is still unstable
export type HandleRequest = (
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

// needs better name (it's not just config)
type BuildConfig =
  | {
      type: 'file';
      pathname: string;
      body: Promise<ReadableStream | string>;
    }
  | {
      type: 'defaultHtml';
      pathname: string;
    };

// This API is still unstable
export type HandleBuild = (utils: {
  renderRsc: RenderRsc;
  renderHtml: RenderHtml;
  rscPath2pathname: (rscPath: string) => string;
}) => AsyncIterable<BuildConfig> | null;

export type ServerEntries = {
  default: {
    handleRequest: HandleRequest;
    handleBuild: HandleBuild;
  };
};

export type HandlerContext = {
  req: Request;
  res?: Response;
  readonly data: Record<string, unknown>;
};

type Handler = (
  ctx: HandlerContext,
  next: () => Promise<void>,
) => Promise<void>;

// This is highly experimental
type ErrorCallback = (
  err: unknown,
  ctx: HandlerContext,
  origin: 'handler' | 'rsc' | 'html',
) => void;

export type MiddlewareOptions = {
  cmd: 'dev' | 'start';
  env: Record<string, string>;
  unstable_onError: Set<ErrorCallback>;
};

/** @deprecated This will be removed soon. */
export type Middleware = (options: MiddlewareOptions) => Handler;
