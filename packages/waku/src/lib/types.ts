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

export type Unstable_CreateAppArgs = {
  processRequest: (req: Request) => Promise<Response | null>;
  config: Omit<Required<Config>, 'vite'>;
  isBuild: boolean;
};

export type Unstable_CreateApp = <
  App extends {
    fetch: (req: Request) => Response | Promise<Response>;
  },
>(
  args: Unstable_CreateAppArgs,
  app?: App,
) => App;

export type Unstable_ServerEntry = {
  default: {
    handleRequest: Unstable_HandleRequest;
    handleBuild: Unstable_HandleBuild;
    createApp?: Unstable_CreateApp;
  };
};
