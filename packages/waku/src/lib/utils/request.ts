import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  decodeAction,
  decodeFormState,
} from '@vitejs/plugin-rsc/rsc';
import { decodeFuncId, decodeRscPath } from '../renderers/utils.js';
import type { HandlerContext } from '../middleware/types.js';
import type { ConfigDev } from '../config/types.js';
import type { HandleRequest } from '../types.js';

type HandleRequestInput = Parameters<HandleRequest>[0];

export async function getInput(ctx: HandlerContext, config: ConfigDev) {
  const url = new URL(ctx.req.url);
  const rscPathPrefix = config.basePath + config.rscBase + '/';
  let rscPath: string | undefined;
  let temporaryReferences: unknown | undefined;
  let input: HandleRequestInput;
  if (url.pathname.startsWith(rscPathPrefix)) {
    rscPath = decodeRscPath(
      decodeURI(url.pathname.slice(rscPathPrefix.length)),
    );
    // server action: js
    const actionId = decodeFuncId(rscPath);
    if (actionId) {
      const body = await getActionBody(ctx.req);
      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply(body, { temporaryReferences });
      const action = await loadServerAction(actionId);
      input = {
        type: 'function',
        fn: action as any,
        args,
        req: ctx.req,
      };
    } else {
      // client RSC request
      let rscParams: unknown = url.searchParams;
      if (ctx.req.body) {
        const body = await getActionBody(ctx.req);
        rscParams = await decodeReply(body, {
          temporaryReferences,
        });
      }
      input = {
        type: 'component',
        rscPath,
        rscParams,
        req: ctx.req,
      };
    }
  } else if (ctx.req.method === 'POST') {
    // cf. packages/waku/src/lib/renderers/rsc.ts `decodePostAction`
    const contentType = ctx.req.headers.get('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // server action: no js (progressive enhancement)
      const formData = (await getActionBody(ctx.req)) as FormData;
      const decodedAction = await decodeAction(formData);
      input = {
        type: 'action',
        fn: async () => {
          const result = await decodedAction();
          return await decodeFormState(result, formData);
        },
        pathname: decodeURI(url.pathname),
        req: ctx.req,
      };
    } else {
      // POST API request
      input = {
        type: 'custom',
        pathname: decodeURI(url.pathname),
        req: ctx.req,
      };
    }
  } else {
    // SSR
    input = {
      type: 'custom',
      pathname: decodeURI(url.pathname),
      req: ctx.req,
    };
  }
  return { input, temporaryReferences };
}

async function getActionBody(req: Request) {
  if (!req.body) {
    throw new Error('missing request body for server function');
  }
  const contentType = req.headers.get('content-type');
  if (contentType?.startsWith('multipart/form-data')) {
    return req.formData();
  } else {
    return req.text();
  }
}
