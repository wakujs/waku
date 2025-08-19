import type { Config } from '../../config.js';

import type { EntriesPrd } from '../types.js';

export type ClonableModuleNode = { url: string; file: string };

export type HandlerContext = {
  req: Request;
  res?: Response;
  readonly data: Record<string, unknown>;
};

export type Handler = (
  ctx: HandlerContext,
  next: () => Promise<void>,
) => Promise<void>;

// This is highly experimental
export type ErrorCallback = (
  err: unknown,
  ctx: HandlerContext,
  origin: 'handler' | 'rsc' | 'html',
) => void;

export type MiddlewareOptions = {
  env: Record<string, string>;
  unstable_onError: Set<ErrorCallback>;
} & (
  | { cmd: 'dev'; config: Config }
  | { cmd: 'start'; loadEntries: () => Promise<EntriesPrd> }
);

export type Middleware = (options: MiddlewareOptions) => Handler;
