import { useRouter } from 'waku';
import type { Unstable_RouteHref } from 'waku/router/client';

type Router = ReturnType<typeof useRouter>;

// Type-level assertions only; this function is never called. RouteConfig.paths
// is augmented in this fixture, so RouteHref is a literal union: a computed
// string is rejected, and callers pass a known href, a structured target, or
// cast via `as Unstable_RouteHref`.
export function assertRouterTargetTyping(router: Router, computed: string) {
  void router.prefetch('/static');
  void router.push('/static');
  void router.replace('/static');
  void router.prefetch({ to: '/dynamic' });
  void router.push({ to: '/dynamic' });
  void router.replace({ to: '/dynamic' });

  // @ts-expect-error a computed string is not a known route href
  void router.prefetch(computed);
  // @ts-expect-error a computed string is not a known route href
  void router.push(computed);
  // @ts-expect-error a computed string is not a known route href
  void router.replace(computed);

  void router.prefetch(computed as Unstable_RouteHref);
  void router.push(computed as Unstable_RouteHref);
}
