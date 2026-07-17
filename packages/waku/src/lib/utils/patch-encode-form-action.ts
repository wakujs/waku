// Patches an `encodeFormAction` callback written against the composition
// API proposed to React (an `encodeDefault` third parameter) to work with
// the current two-parameter callback, by porting React's default
// progressive-enhancement encoding. Delete this file once React provides
// `encodeDefault` natively.
// https://github.com/facebook/react/blob/8b2e903a7447d370eb77bb117bc4c0ae240ce831/packages/react-client/src/ReactFlightReplyClient.js#L927-L1009
//
// Adaptations: the callback receives no reference identity, so the cache is
// keyed by the bound-arguments promise and unbound references (which get a
// fresh resolved promise per render) are inferred; the Fizz-provided
// `identifierPrefix` is replaced by a local counter; and the private
// `processReply` is reached through the public `encodeReply`.

export type ReactCustomFormAction = {
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

// fulfills with `null` for a reference whose arguments resolve empty
type EncodedThenable = Promise<FormData | null> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: FormData | null;
  reason?: unknown;
};

// a flight chunk is a thenable with a string `status`
const isFlightChunk = (value: object): boolean =>
  typeof (value as { status?: unknown }).status === 'string';

type EncodeFormAction = (
  id: string,
  boundPromise: Promise<unknown[]>,
) => ReactCustomFormAction;

export const patchEncodeFormAction = (
  encodeFormAction: (
    id: string,
    boundPromise: Promise<unknown[]>,
    encodeDefault: () => ReactCustomFormAction,
  ) => ReactCustomFormAction,
  encodeReply: EncodeReply,
): EncodeFormAction => {
  const boundCache = new WeakMap<object, EncodedThenable>();
  const unboundIds = new Set<string>();
  let nextFormId = 0;

  const encodeFormData = (
    id: string,
    boundPromise: Promise<unknown[]>,
  ): EncodedThenable => {
    // flight chunks are not spec-compliant thenables; re-wrap before chaining
    const thenable = Promise.resolve(boundPromise)
      .then((args) => {
        if (!Array.isArray(args) || !args.length) {
          unboundIds.add(id);
          return null;
        }
        return encodeReply({ id, bound: Promise.resolve(args) });
      })
      .then(
        (body) => {
          let data: FormData | null = null;
          if (body !== null) {
            if (body instanceof FormData) {
              data = body;
            } else {
              data = new FormData();
              if (typeof body === 'string') {
                data.append('0', body);
              } else {
                body.forEach((value, key) => data!.append(key, value));
              }
            }
          }
          thenable.status = 'fulfilled';
          thenable.value = data;
          return data;
        },
        (reason) => {
          thenable.status = 'rejected';
          thenable.reason = reason;
          throw reason;
        },
      ) as EncodedThenable;
    thenable.status = 'pending';
    return thenable;
  };

  const defaultEncodeFormAction: EncodeFormAction = (id, boundPromise) => {
    let data: null | FormData = null;
    let name: string;
    // React branches on its internal `referenceClosure.bound`; the callback
    // cannot see it, so a reference is treated as possibly bound unless it
    // was already resolved as unbound and arrives as another fresh promise
    if (isFlightChunk(boundPromise) || !unboundIds.has(id)) {
      let thenable = boundCache.get(boundPromise);
      if (!thenable) {
        thenable = encodeFormData(id, boundPromise);
        boundCache.set(boundPromise, thenable);
      }
      if (thenable.status === 'rejected') {
        throw thenable.reason;
      } else if (thenable.status !== 'fulfilled') {
        throw thenable;
      }
      const encodedFormData = thenable.value!;
      if (encodedFormData === null) {
        name = '$ACTION_ID_' + id;
      } else {
        const identifierPrefix = 'W' + nextFormId++;
        const prefixedData = new FormData();
        encodedFormData.forEach((value, key) => {
          prefixedData.append('$ACTION_' + identifierPrefix + ':' + key, value);
        });
        data = prefixedData;
        name = '$ACTION_REF_' + identifierPrefix;
      }
    } else {
      // ambiguous: an unbound retry, or a client-side bind sharing the action
      Promise.resolve(boundPromise).then(
        (args) => {
          if (Array.isArray(args) && args.length) {
            console.warn(
              `The no-JS fallback for a form using the server action "${id}" dropped its bound arguments because the same action is also used unbound on this page. Bind arguments in a server component or pass them as hidden form fields to support no-JS submissions.`,
            );
          }
        },
        () => {},
      );
      name = '$ACTION_ID_' + id;
    }
    return {
      name: name,
      method: 'POST',
      encType: 'multipart/form-data',
      data: data,
    };
  };

  return (id, boundPromise) =>
    encodeFormAction(id, boundPromise, () =>
      defaultEncodeFormAction(id, boundPromise),
    );
};
