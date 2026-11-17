import { requestRedirect } from 'waku/router/server';
import { nestedRoute } from './lib/routes';

export const assertRedirectTyping = (computed: string) => [
  () => requestRedirect('/bar'),
  () => requestRedirect(nestedRoute({ params: { name: 'x' } })),
  // @ts-expect-error a computed string is not a known route href
  () => requestRedirect(computed),
  () => requestRedirect(computed as Parameters<typeof requestRedirect>[0]),
];
