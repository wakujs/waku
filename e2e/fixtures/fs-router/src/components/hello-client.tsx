'use client';

import { Suspense, useEffect, useState } from 'react';
import { sayHello } from '../functions/say-hello.js';

export function HelloClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    // FIXME what should be the best practice for this case?
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);
  }, []);
  return isClient && <Suspense fallback="loading...">{sayHello()}</Suspense>;
}
