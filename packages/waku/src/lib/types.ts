import type { ReactNode } from 'react';

type Elements = Record<string, unknown>;

type GetInput = () =>
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
  | { type: 'custom'; pathname: string };

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

/** @deprecated This will be removed soon. */
export type ServerEntries = {
  default: {
    handleRequest: HandleRequest;
    handleBuild: HandleBuild;
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

export type unstable_ServerEntryFetch = (
  req: Request,
  utils: {
    getInput: GetInput;
    renderRsc: RenderRsc;
    renderHtml: RenderHtml;
    renderDefaultHtml: () => Promise<Response>;
    renderNotFound: () => Promise<Response>;
  },
) => Promise<Response>;

export type unstable_ServerEntryBuild = (utils: {
  renderRsc: RenderRsc;
  renderHtml: RenderHtml;
  rscPath2pathname: (rscPath: string) => string;
  generateFile: (
    pathname: string,
    body: ReadableStream | string,
  ) => Promise<void>;
  generateDefaultHtml: (pathname: string) => Promise<void>;
}) => Promise<void>;

export type unstable_ServerEntry = {
  default: {
    fetch: unstable_ServerEntryFetch;
    build: unstable_ServerEntryBuild;
  };
};
