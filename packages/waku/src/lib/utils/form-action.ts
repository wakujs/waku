import { patchEncodeFormAction } from './patch-encode-form-action.js';
import type { EncodeReply } from './patch-encode-form-action.js';

export const FORM_ACTION_QUERY_PARAM = '__waku_action';

export const hasFormActionMarker = (url: URL): boolean =>
  url.searchParams.has(FORM_ACTION_QUERY_PARAM);

export const addFormActionMarker = (url: string): string => {
  const parsed = new URL(url, 'file:///');
  parsed.searchParams.set(FORM_ACTION_QUERY_PARAM, '1');
  return parsed.pathname + parsed.search + parsed.hash;
};

/**
 * Adds the marker for no-JS server actions to a `useActionState` permalink.
 * React replaces the form target with the permalink verbatim, so the marker
 * must be part of it.
 */
export const patchPermalink = addFormActionMarker;

// The callback matches the composition API proposed to React;
// `patchEncodeFormAction` supplies `encodeDefault` until React does.
export const createEncodeFormAction = (
  actionUrl: string | undefined,
  encodeReply: EncodeReply,
) =>
  patchEncodeFormAction((_id, _bound, encodeDefault) => {
    if (actionUrl === undefined) {
      // Fizz catches this per form and falls back to hydration replay
      throw new Error('No-JS server actions require a dynamic render');
    }
    return { ...encodeDefault(), action: actionUrl };
  }, encodeReply);
