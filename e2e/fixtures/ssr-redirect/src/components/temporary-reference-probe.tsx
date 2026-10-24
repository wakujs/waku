'use client';

import { useState, useTransition } from 'react';

class ClientValue {}

export function TemporaryReferenceProbe({
  value,
  roundTrip,
}: {
  value: unknown;
  roundTrip: (value: unknown) => Promise<void>;
}) {
  const [reference] = useState(() => new ClientValue());
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <h1>Temporary reference</h1>
      <p>
        {value === reference
          ? 'Original object received'
          : 'Waiting for object'}
      </p>
      <button
        disabled={pending}
        onClick={() => startTransition(() => roundTrip(reference))}
      >
        Round trip
      </button>
    </div>
  );
}
