import type { ReactFormState } from 'react-dom/client';
import type { Config } from '../../config.js';
import type { Unstable_HandleRequest as HandleRequest } from '../types.js';
import { ETAGS_HEADER, parseClientEtags } from '../utils-isomorphic/etags.js';
import { isRenderCancellation } from '../utils-isomorphic/render-cancellation.js';
import { parseRequestUrl } from './request-url.js';

type HandleRequestInput = Parameters<HandleRequest>[0];

const invokeServerAction = async (
  action: (...args: unknown[]) => unknown,
  args: unknown[],
) => {
  try {
    return await action(...args);
  } catch (error) {
    if (!isRenderCancellation(error)) {
      throw error;
    }
  }
};

export async function getInput(
  req: Request,
  config: Omit<Required<Config>, 'vite'>,
  temporaryReferences: unknown,
  decodeReply: (
    body: string | FormData,
    options?: object,
  ) => Promise<unknown[]>,
  decodeAction: (body: FormData) => Promise<() => Promise<void>> | null,
  decodeFormState: (
    actionResult: unknown,
    body: FormData,
  ) => Promise<ReactFormState | undefined>,
  loadServerAction: (id: string) => Promise<unknown>,
) {
  const url = new URL(req.url);
  const parsed = parseRequestUrl(url, config.basePath, config.rscBase);
  const { pathname } = parsed;
  const etags = parseClientEtags(req.headers.get(ETAGS_HEADER));
  let input: HandleRequestInput;
  if (parsed.type !== 'http') {
    if (parsed.type === 'call') {
      validateServerActionRequest(req);
      const body = await getActionBody(req);
      const args = await decodeReply(body, { temporaryReferences });
      const action = await loadServerAction(parsed.actionId);
      input = {
        type: 'call',
        fn: (...args) =>
          invokeServerAction(action as (...args: unknown[]) => unknown, args),
        args,
        pathname,
        req,
        etags,
      };
    } else {
      let rscParams: unknown = url.searchParams;
      if (req.body) {
        validateServerActionRequest(req);
        const body = await getActionBody(req);
        rscParams = await decodeReply(body, {
          temporaryReferences,
        });
      }
      input = {
        type: 'rsc',
        rscPath: parsed.rscPath,
        rscParams,
        pathname,
        req,
        etags,
      };
    }
  } else if (req.method === 'POST') {
    const contentType = req.headers.get('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // possibly a no-js server action submission (progressive enhancement)
      let parsing:
        | Promise<
            | { action: true; formState: unknown }
            | { action: false; formData: FormData }
          >
        | undefined;
      input = {
        type: 'http',
        tryAction: () =>
          (parsing ??= (async () => {
            const formData = (await getActionBody(req)) as FormData;
            const decodedAction = await decodeAction(formData);
            if (typeof decodedAction !== 'function') {
              return { action: false as const, formData };
            }
            validateServerActionRequest(req);
            const result = await invokeServerAction(decodedAction, []);
            const formState = await decodeFormState(result, formData);
            return { action: true as const, formState };
          })()),
        pathname,
        req,
        etags,
      };
    } else {
      // POST API request
      input = {
        type: 'http',
        pathname,
        req,
        etags,
      };
    }
  } else {
    // SSR
    input = {
      type: 'http',
      pathname,
      req,
      etags,
    };
  }
  return input;
}

function validateServerActionRequest(req: Request) {
  if (req.method !== 'POST') {
    throw new Response('Method Not Allowed', { status: 405 });
  }
  const origin = req.headers.get('origin');
  if (origin) {
    if (origin === 'null') {
      throw new Response('Forbidden', { status: 403 });
    }
    const requestUrl = new URL(req.url);
    let originUrl: URL;
    try {
      originUrl = new URL(origin);
    } catch {
      throw new Response('Forbidden', { status: 403 });
    }
    if (
      originUrl.origin !== requestUrl.origin &&
      !(
        requestUrl.protocol === 'http:' &&
        originUrl.protocol === 'https:' &&
        originUrl.host === requestUrl.host
      )
    ) {
      throw new Response('Forbidden', { status: 403 });
    }
  } else if (req.headers.get('sec-fetch-site') === 'cross-site') {
    throw new Response('Forbidden', { status: 403 });
  }
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
