import type { IncomingMessage, ServerResponse } from 'node:http';

export type PreviewServerMiddlewares = {
  use: (
    fn: (
      req: IncomingMessage,
      res: ServerResponse,
      next: (err?: unknown) => void,
    ) => void,
  ) => void;
};

export async function startPreviewServer(): Promise<{
  baseUrl: string;
  middlewares: PreviewServerMiddlewares;
  close: () => Promise<void>;
}> {
  const start = globalThis.__WAKU_START_PREVIEW_SERVER__;
  if (!start) {
    throw new Error('Preview server is not available.');
  }
  return start();
}
