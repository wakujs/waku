import type { ReactFormState } from 'react-dom/client';
import { decodeFuncId, decodeRscPath } from '../utils/rsc-path.js';
import type { Config } from '../../config.js';
import type { Unstable_HandleRequest as HandleRequest } from '../types.js';
import { removeBase } from './path.js';

type HandleRequestInput = Parameters<HandleRequest>[0];

export async function getInput(
  req: Request,
  config: Omit<Required<Config>, 'vite'>,
  temporaryReferences: unknown,
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
  const url = new URL(req.url);
  url.pathname = removeBase(url.pathname, config.basePath);
  const rscPathPrefix = '/' + config.rscBase + '/';
  let rscPath: string | undefined;
  let input: HandleRequestInput;
  if (url.pathname.startsWith(rscPathPrefix)) {
    rscPath = decodeRscPath(
      decodeURI(url.pathname.slice(rscPathPrefix.length)),
    );
    // server action: js
    const actionId = decodeFuncId(rscPath);
    if (actionId) {
      const body = await getActionBody(req);
      const args = await decodeReply(body, { temporaryReferences });
      const action = await loadServerAction(actionId);
      input = {
        type: 'function',
        fn: action as any,
        args,
        req,
      };
    } else {
      // client RSC request
      let rscParams: unknown = url.searchParams;
      if (req.body) {
        const body = await getActionBody(req);
        rscParams = await decodeReply(body, {
          temporaryReferences,
        });
      }
      input = {
        type: 'component',
        rscPath,
        rscParams,
        req,
      };
    }
  } else if (req.method === 'POST') {
    const contentType = req.headers.get('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // server action: no js (progressive enhancement)
      const formData = (await getActionBody(req)) as FormData;
      const decodedAction = await decodeAction(formData);
      input = {
        type: 'action',
        fn: async () => {
          const result = await decodedAction();
          return await decodeFormState(result, formData);
        },
        pathname: decodeURI(url.pathname),
        req,
      };
    } else {
      // POST API request
      input = {
        type: 'custom',
        pathname: decodeURI(url.pathname),
        req,
      };
    }
  } else {
    // SSR
    input = {
      type: 'custom',
      pathname: decodeURI(url.pathname),
      req,
    };
  }
  return input;
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
