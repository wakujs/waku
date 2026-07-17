import { patchEncodeFormAction } from './patch-encode-form-action.js';
import type { EncodeReply } from './patch-encode-form-action.js';

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

/**
 * Adds the marker for no-JS server actions to a `useActionState` permalink.
 * React replaces the form target with the permalink verbatim, so the marker
 * must be part of it.
 */
export const patchPermalink = (permalink: string): string => {
  const hashIndex = permalink.indexOf('#');
  const hash = hashIndex === -1 ? '' : permalink.slice(hashIndex);
  const base = hashIndex === -1 ? permalink : permalink.slice(0, hashIndex);
  const queryIndex = base.indexOf('?');
  const pathname = queryIndex === -1 ? base : base.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : base.slice(queryIndex);
  return addFormActionMarker(pathname, search) + hash;
};

// The callback is written against the composition API proposed to React:
// spread the default encoding and override only the action URL.
// `patchEncodeFormAction` supplies `encodeDefault` until React does.
export const createFormActionEncoder = (
  getActionUrl: () => string | undefined,
  encodeReply: EncodeReply,
) =>
  patchEncodeFormAction((_actionId, _boundPromise, encodeDefault) => {
    const action = getActionUrl();
    if (action === undefined) {
      // static renders have no URL to mark; React falls back to replaying
      // pre-hydration submissions once hydration completes
      throw new Error('No-JS server actions require a dynamic render');
    }
    return { ...encodeDefault(), action };
  }, encodeReply);
