import type { ReactFormState } from 'react-dom/client';
import { decodeFuncId, decodeRscPath } from '../renderers/utils.js';
import type { ConfigDev } from '../config/types.js';
import { withoutBase, withTrialSlash } from './path.js';
import type {
  Unstable_HandleRequest as HandleRequest,
  HandlerContext,
} from '../types.js';

type HandleRequestInput = Parameters<HandleRequest>[0];

export async function getInput(
  ctx: HandlerContext,
  config: ConfigDev,
  createTemporaryReferenceSet: () => unknown,
  decodeReply: (
    body: string | FormData,
    options?: unknown,
  ) => Promise<unknown[]>,
  decodeAction: (body: FormData) => Promise<() => Promise<void>>,
  decodeFormState: (
    actionResult: unknown,
    body: FormData,
  ) => Promise<ReactFormState | undefined>,
  loadServerAction: (id: string) => Promise<unknown>,
) {
  const url = new URL(ctx.req.url);
  const rscPathPrefix = `${withTrialSlash(config.basePath)}${config.rscBase}/`;
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
      pathname: withoutBase(url.pathname, config.basePath),
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
