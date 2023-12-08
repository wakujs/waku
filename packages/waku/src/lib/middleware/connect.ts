import type { IncomingMessage, ServerResponse } from 'node:http';

import type { BaseReq, BaseRes, Handler } from '../rsc/types.js';
import { createDevHandler } from '../rsc/dev-handler.js';
import { createPrdHandler } from '../rsc/prd-handler.js';

const connectWrapper = (
  m: Handler<
    BaseReq & { orig: IncomingMessage },
    BaseRes & { orig: ServerResponse }
  >,
) => {
  return async (
    connectReq: IncomingMessage,
    connectRes: ServerResponse,
    next: (err?: unknown) => void,
  ) => {
    const { Readable, Writable } = await import('node:stream');
    const req: BaseReq & { orig: IncomingMessage } = {
      stream: Readable.toWeb(connectReq) as any,
      method: connectReq.method || '',
      url: new URL(
        connectReq.url || '',
        `http://${connectReq.headers.host}`,
      ).toString(),
      contentType: connectReq.headers['content-type'],
      orig: connectReq,
    };
    const res: BaseRes & { orig: ServerResponse } = {
      stream: Writable.toWeb(connectRes),
      setStatus: (code) => (connectRes.statusCode = code),
      setHeader: (name, value) => connectRes.setHeader(name, value),
      orig: connectRes,
    };
    m(req, res, next);
  };
};

export function connectDevMiddleware(
  ...args: Parameters<typeof createDevHandler>
) {
  return connectWrapper(createDevHandler(...args));
}

export function connectPrdMiddleware(
  ...args: Parameters<typeof createPrdHandler>
) {
  return connectWrapper(createPrdHandler(...args));
}
