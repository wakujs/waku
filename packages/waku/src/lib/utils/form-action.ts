export const FORM_ACTION_QUERY_PARAM = '__waku_action';

export const hasFormActionMarker = (url: URL): boolean =>
  url.searchParams.has(FORM_ACTION_QUERY_PARAM);

export const addFormActionMarker = (
  pathname: string,
  search: string,
): string => {
  if (search && new URLSearchParams(search).has(FORM_ACTION_QUERY_PARAM)) {
    return pathname + search;
  }
  return (
    pathname + (search ? search + '&' : '?') + FORM_ACTION_QUERY_PARAM + '=1'
  );
};

type CustomFormAction = {
  name?: string;
  action?: string;
  encType?: string;
  method?: string;
  target?: string;
  data?: FormData | null;
};

export type EncodeReply = (
  value: unknown,
) => Promise<string | URLSearchParams | FormData>;

type EncodingEntry = {
  status: 'pending' | 'fulfilled' | 'rejected';
  boundArgs?: unknown[];
  value?: FormData;
  reason?: unknown;
  then?: (onFulfilled: () => void, onRejected: () => void) => void;
};

// React substitutes a fresh `Promise.resolve([])` on every `$$FORM_ACTION`
// call for unbound server references, while payload-bound references carry a
// stable flight chunk (a thenable with a string `status`). The chunk check and
// the id-keyed set below exist to converge across Fizz suspension retries
// despite that unstable identity; they cannot distinguish an unbound retry
// from the first call of a client-side `.bind()`, hence the dropped-arguments
// warning. Once React gives custom encodeFormAction implementations a stable
// identity (a singleton substitute, or the reference itself), the heuristic
// becomes exact and the limitation disappears with no changes needed here.
// https://github.com/facebook/react/issues/TODO

const isFlightChunk = (value: object): boolean =>
  typeof (value as { status?: unknown }).status === 'string';

export function createFormActionEncoder(
  getActionUrl: () => string,
  encodeReply: EncodeReply,
): (actionId: string, boundPromise: Promise<unknown[]>) => CustomFormAction {
  const entriesByBoundPromise = new WeakMap<object, EncodingEntry>();
  let prefixCounter = 0;
  const confirmedUnboundActionIds = new Set<string>();

  const unboundFields = (actionId: string): CustomFormAction => ({
    name: '$ACTION_ID_' + actionId,
    method: 'POST',
    encType: 'multipart/form-data',
    data: null,
    action: getActionUrl(),
  });

  const serve = (actionId: string, entry: EncodingEntry): CustomFormAction => {
    if (entry.status === 'rejected') {
      throw entry.reason;
    }
    if (entry.status !== 'fulfilled') {
      throw entry;
    }
    if (!entry.boundArgs!.length) {
      return unboundFields(actionId);
    }
    const prefix = 'W' + prefixCounter++;
    const data = new FormData();
    entry.value!.forEach((value, key) => {
      data.append('$ACTION_' + prefix + ':' + key, value);
    });
    return {
      name: '$ACTION_REF_' + prefix,
      method: 'POST',
      encType: 'multipart/form-data',
      data,
      action: getActionUrl(),
    };
  };

  const startEncoding = (
    actionId: string,
    boundPromise: Promise<unknown[]>,
  ): EncodingEntry => {
    const entry: EncodingEntry = { status: 'pending' };
    const done = Promise.resolve(boundPromise)
      .then((args) => {
        const boundArgs = Array.isArray(args) ? args : [];
        entry.boundArgs = boundArgs;
        if (!boundArgs.length) {
          confirmedUnboundActionIds.add(actionId);
          return null;
        }
        return encodeReply({ id: actionId, bound: Promise.resolve(boundArgs) });
      })
      .then(async (body) => {
        if (body !== null) {
          if (typeof body === 'string') {
            const data = new FormData();
            data.append('0', body);
            entry.value = data;
          } else if (body instanceof URLSearchParams) {
            const data = new FormData();
            body.forEach((value, key) => data.append(key, value));
            entry.value = data;
          } else {
            entry.value = body;
          }
        }
        entry.status = 'fulfilled';
      })
      .catch((reason) => {
        entry.status = 'rejected';
        entry.reason = reason;
      });
    entry.then = (onFulfilled, onRejected) => {
      done.then(onFulfilled, onRejected);
    };
    entriesByBoundPromise.set(boundPromise, entry);
    return entry;
  };

  const warnIfArgumentsDropped = (
    actionId: string,
    boundPromise: Promise<unknown[]>,
  ) => {
    Promise.resolve(boundPromise).then(
      (args) => {
        if (Array.isArray(args) && args.length) {
          console.warn(
            `The no-JS fallback for a form using the server action "${actionId}" dropped its bound arguments because the same action is also used unbound on this page. Bind arguments in a server component or pass them as hidden form fields to support no-JS submissions.`,
          );
        }
      },
      () => {},
    );
  };

  return (actionId, boundPromise) => {
    const cached = entriesByBoundPromise.get(boundPromise);
    if (cached) {
      return serve(actionId, cached);
    }
    if (
      !isFlightChunk(boundPromise) &&
      confirmedUnboundActionIds.has(actionId)
    ) {
      warnIfArgumentsDropped(actionId, boundPromise);
      return unboundFields(actionId);
    }
    return serve(actionId, startEncoding(actionId, boundPromise));
  };
}
