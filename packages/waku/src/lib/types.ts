import type { ReactNode } from 'react';

import type { Middleware } from '../config.js';
import type { ConfigPrd } from '../lib/config/types.js';
import type { PathSpec } from '../lib/utils/path.js';

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
      body: Promise<ReadableStream>;
    }
  | {
      type: 'htmlHead';
      pathSpec: PathSpec;
      head?: string;
    }
  | {
      type: 'defaultHtml';
      pathname: string;
      head?: string;
    };

// This API is still unstable
export type HandleBuild = (utils: {
  renderRsc: RenderRsc;
  renderHtml: RenderHtml;
  rscPath2pathname: (rscPath: string) => string;
}) => AsyncIterable<BuildConfig> | null;

export type EntriesDev = {
  default: {
    handleRequest: HandleRequest;
    handleBuild: HandleBuild;
  };
};

export type EntriesPrd = EntriesDev & {
  configPrd: ConfigPrd;
  loadMiddleware: () => Promise<{ default: Middleware }[]>;
  loadModule: (id: string) => Promise<unknown>;
  defaultHtmlHead: string;
  dynamicHtmlPaths: [pathSpec: PathSpec, htmlHead: string][];
  publicIndexHtml: string;
  loadPlatformData?: (key: string) => Promise<unknown>;
};
