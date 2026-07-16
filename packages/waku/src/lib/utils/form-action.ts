export const FORM_ACTION_QUERY_PARAM = '__waku_action';

export const hasFormActionMarker = (url: URL): boolean =>
  url.searchParams.has(FORM_ACTION_QUERY_PARAM);

export const addFormActionMarker = (
  pathname: string,
  search: string,
): string =>
  search && new URLSearchParams(search).has(FORM_ACTION_QUERY_PARAM)
    ? pathname + search
    : pathname + (search ? search + '&' : '?') + FORM_ACTION_QUERY_PARAM + '=1';

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

// `data` is the encoded payload, `null` for unbound references, absent while
// encoding is pending
type Entry = {
  promise: Promise<void>;
  data?: FormData | null;
  error?: unknown;
};

const toFormData = (body: string | URLSearchParams | FormData): FormData => {
  if (body instanceof FormData) {
    return body;
  }
  const data = new FormData();
  if (typeof body === 'string') {
    data.append('0', body);
  } else {
    body.forEach((value, key) => data.append(key, value));
  }
  return data;
};

// a flight chunk is a thenable with a string `status`
const isFlightChunk = (value: object): boolean =>
  typeof (value as { status?: unknown }).status === 'string';

// React calls the encoder with a fresh `Promise.resolve([])` on every render
// for unbound references, but with a stable flight chunk for payload-bound
// ones. Caching by that identity converges across Fizz suspension retries;
// the id-keyed set covers the unbound case, at the cost of not being able to
// tell an unbound retry from the first render of a client-side `.bind()`
// (hence the warning). A stable identity from React would make this exact.
export const createFormActionEncoder = (
  getActionUrl: () => string | undefined,
  encodeReply: EncodeReply,
) => {
  const entries = new WeakMap<object, Entry>();
  const unboundIds = new Set<string>();
  let count = 0;

  const fields = (name: string, data: FormData | null): CustomFormAction => ({
    name,
    method: 'POST',
    encType: 'multipart/form-data',
    data,
    action: getActionUrl()!,
  });

  const start = (actionId: string, boundPromise: Promise<unknown[]>): Entry => {
    const entry: Entry = {
      // flight chunks are not spec-compliant thenables; re-wrap before chaining
      promise: Promise.resolve(boundPromise)
        .then((args) => {
          if (!Array.isArray(args) || !args.length) {
            unboundIds.add(actionId);
            return null;
          }
          return encodeReply({ id: actionId, bound: Promise.resolve(args) });
        })
        .then(
          (body) => {
            entry.data = body === null ? null : toFormData(body);
          },
          (error) => {
            entry.error = error;
          },
        ),
    };
    entries.set(boundPromise, entry);
    return entry;
  };

  const serve = (actionId: string, entry: Entry): CustomFormAction => {
    if ('error' in entry) {
      throw entry.error;
    }
    if (!('data' in entry)) {
      throw entry.promise;
    }
    if (entry.data === null) {
      return fields('$ACTION_ID_' + actionId, null);
    }
    const prefix = 'W' + count++;
    const data = new FormData();
    entry.data.forEach((value, key) =>
      data.append('$ACTION_' + prefix + ':' + key, value),
    );
    return fields('$ACTION_REF_' + prefix, data);
  };

  return (
    actionId: string,
    boundPromise: Promise<unknown[]>,
  ): CustomFormAction => {
    if (getActionUrl() === undefined) {
      // static renders have no URL to mark; React falls back to replaying
      // pre-hydration submissions once hydration completes
      throw new Error('No-JS server actions require a dynamic render');
    }
    const entry = entries.get(boundPromise);
    if (entry) {
      return serve(actionId, entry);
    }
    if (!isFlightChunk(boundPromise) && unboundIds.has(actionId)) {
      // ambiguous: an unbound retry, or a client-side bind sharing the action
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
      return fields('$ACTION_ID_' + actionId, null);
    }
    return serve(actionId, start(actionId, boundPromise));
  };
};
