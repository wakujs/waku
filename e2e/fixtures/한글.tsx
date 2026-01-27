'use client';

import { useRouter } from 'waku';

export default function Korean() {
  const { path } = useRouter();

  return (
    <div>
      <h1>{path}</h1>
    </div>
  );
}
