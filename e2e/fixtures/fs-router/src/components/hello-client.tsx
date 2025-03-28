'use client';

import { Suspense, useState, useEffect } from 'react';

import { sayHello } from '../functions/say-hello.js';

export function HelloClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  return isClient && <Suspense fallback="loading...">{sayHello()}</Suspense>;
}
