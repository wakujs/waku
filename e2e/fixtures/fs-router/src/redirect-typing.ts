import type { Unstable_RouteHref } from 'waku/router/client-core';
import { unstable_redirect as redirect } from 'waku/router/server';
import { nestedRoute } from './lib/routes';

export const assertRedirectTyping = (computed: string) => [
  () => redirect('/bar'),
  () => redirect(nestedRoute({ params: { name: 'x' } })),
  // @ts-expect-error a computed string is not a known route href
  () => redirect(computed),
  () => redirect(computed as Unstable_RouteHref),
];
