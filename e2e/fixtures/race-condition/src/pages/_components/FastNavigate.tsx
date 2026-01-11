'use client';

import { useCallback } from 'react';
import { useRouter } from 'waku';

export function FastNavigate() {
  const { push } = useRouter();
  const onClick = useCallback(() => {
    void push('/about');
    void push('/bar');
  }, [push]);
  return <button onClick={onClick}>Fast Navigate</button>;
}
