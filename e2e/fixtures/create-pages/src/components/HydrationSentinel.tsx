'use client';

import { useEffect, useRef } from 'react';

export const HydrationSentinel = () => {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // the DOM is the external system the test observes
    ref.current!.textContent = 'hydrated';
  }, []);
  return (
    <p ref={ref} data-testid="hydration-state">
      pending
    </p>
  );
};
