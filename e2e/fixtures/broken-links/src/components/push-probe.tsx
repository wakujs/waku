'use client';

import { useCallback, useLayoutEffect } from 'react';
import { useRouter } from 'waku';

declare global {
  interface Window {
    __pushOutcome?: string;
  }
}

export function PushProbe() {
  const { push: navigate } = useRouter();
  const push = useCallback(
    (to: string) => {
      window.__pushOutcome = 'pending';
      navigate(to as never).then(
        () => {
          window.__pushOutcome = 'resolved';
        },
        () => {
          window.__pushOutcome = 'rejected';
        },
      );
    },
    [navigate],
  );
  useLayoutEffect(() => {
    if (
      new URLSearchParams(window.location.search).has('layout-redirect') &&
      !window.__pushOutcome
    ) {
      push('/redirect-query');
    }
  }, [push]);
  return (
    <p>
      <button
        data-testid="push-throw-redirect"
        onClick={() => push('/throw-redirect')}
      >
        Push throw-redirect
      </button>
      <button data-testid="push-missing" onClick={() => push('/missing-page')}>
        Push missing
      </button>
    </p>
  );
}
