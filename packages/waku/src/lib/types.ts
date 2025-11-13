import type { ReactNode } from 'react';
import type { Config } from '../config.js';

type RenderRsc = (elements: Record<string, unknown>) => Promise<ReadableStream>;

type RenderHtml = (
  elementsStream: ReadableStream,
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
    req: Request,
    renderBody: () => Promise<ReadableStream | string>,
  ) => Promise<void>;
  generateDefaultHtml: (pathname: string) => Promise<void>;
}) => Promise<void>;

export type Unstable_ServerEntry = {
  default: {
    fetch: (req: Request, ...args: any[]) => Response | Promise<Response>;
    build: () => Promise<void>;
    postBuild?: [modulePath: string, ...args: unknown[]];
  };
};

export type Unstable_ProcessRequest = (
  req: Request,
) => Promise<Response | null>;

export type Unstable_ProcessBuild = () => Promise<void>;

export type Unstable_CreateServerEntryAdapter = <Options>(
  fn: (
    args: {
      processRequest: Unstable_ProcessRequest;
      processBuild: Unstable_ProcessBuild;
      config: Omit<Required<Config>, 'vite'>;
      isBuild: boolean;
    },
    options?: Options,
  ) => Unstable_ServerEntry['default'],
) => (
  args: {
    handleRequest: Unstable_HandleRequest;
    handleBuild: Unstable_HandleBuild;
  },
  options?: Options,
) => Unstable_ServerEntry['default'];
