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
  cmd: 'dev' | 'start';
  env: Record<string, string>;
  unstable_onError: Set<ErrorCallback>;
};

export type Middleware = (options: MiddlewareOptions) => Handler;
