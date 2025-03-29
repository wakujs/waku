'use client';

import { use } from 'react';

export function SayHello({ promise }: { promise: Promise<string> }) {
  const name = use(promise);
  return <div>Hello {name}</div>;
}
