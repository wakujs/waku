'use client';

import { useRouter } from 'waku';

export function SkipNavToBButton() {
  const router = useRouter();
  return (
    <button
      data-testid="skip-go-b"
      onClick={() => router.push('/skip/b')}
      type="button"
    >
      Go skip/b
    </button>
  );
}
