import type { ReactFormState } from 'react-dom/client';
import type { Config } from '../../config.js';
import type { Unstable_GetRscInput as GetRscInput } from '../types.js';
import { decodeFuncId, decodeRscPath } from '../utils/rsc-path.js';
import { removeBase } from './path.js';

type RscInput = Awaited<ReturnType<GetRscInput>>;

export function getDecodedPathname(
  req: Request,
  config: Omit<Required<Config>, 'vite'>,
) {
  const url = new URL(req.url);
  const pathname = removeBase(url.pathname, config.basePath);
  return decodeURI(pathname);
}

export async function getRscInput(
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
  let input: RscInput = null;
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
        fn: action as never,
        args,
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
      };
    }
  } else if (req.method === 'POST') {
    const contentType = req.headers.get('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // server action: no js (progressive enhancement)
      input = {
        type: 'action',
        fn: async () => {
          const formData = (await getActionBody(req)) as FormData;
          const decodedAction = await decodeAction(formData);
          const result = await decodedAction();
          return await decodeFormState(result, formData);
        },
      };
    }
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
