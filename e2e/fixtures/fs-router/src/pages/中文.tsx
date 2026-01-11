'use client';

import { useRouter } from 'waku';

export default function Kanji() {
  const { path } = useRouter();

  return (
    <div>
      <h1>{path}</h1>
    </div>
  );
}
