'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { echoOpaque } from './opaque-server';

let original: unknown;

export function OpaqueResult({ value }: { value: unknown }) {
  return (
    <p data-testid="opaque-prop">
      {value === original ? 'same opaque prop' : 'changed opaque prop'}
    </p>
  );
}

export function OpaqueAction() {
  const [result, setResult] = useState<ReactNode>(null);
  return (
    <>
      <button
        onClick={async () => {
          original = new (class Opaque {})();
          const response = await echoOpaque(original);
          setResult(
            <>
              <p data-testid="opaque-value">
                {response.value === original
                  ? 'same opaque value'
                  : 'changed opaque value'}
              </p>
              {response.element}
            </>,
          );
        }}
      >
        Echo opaque reference
      </button>
      {result}
    </>
  );
}
