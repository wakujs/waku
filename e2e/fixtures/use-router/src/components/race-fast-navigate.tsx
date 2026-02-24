'use client';

import { useCallback } from 'react';
import { useRouter } from 'waku';

export function RaceFastNavigate() {
  const { push } = useRouter();
  const onClick = useCallback(() => {
    void push('/race-about');
    void push('/race-bar');
  }, [push]);
  return <button onClick={onClick}>Fast Navigate</button>;
}
