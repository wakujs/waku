'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'waku';

export function useRouterEvents() {
  const router = useRouter();
  const [routerState, setRouterState] = useState<'idle' | 'pending'>('idle');
  useEffect(() => {
    const logStart = (event: any) => {
      console.log('routing start', event);
      setRouterState('pending');
    };
    const logComplete = (event: any) => {
      console.log('routing complete', event);
      setRouterState('idle');
    };
    router.unstable_events.on('start', logStart);
    router.unstable_events.on('complete', logComplete);
    console.log('set up routing events');
    return () => {
      router.unstable_events.off('start', logStart);
      router.unstable_events.off('complete', logComplete);
      console.log('cleaned up routing events');
    };
  }, [router]);
  return { routerState };
}

export const RouterEvents = ({ children }: { children: ReactNode }) => {
  const { routerState } = useRouterEvents();
  return (
    <div>
      <div>
        Router state:{' '}
        <span data-testid="router-event-state">{routerState}</span>
      </div>
      {children}
    </div>
  );
};
