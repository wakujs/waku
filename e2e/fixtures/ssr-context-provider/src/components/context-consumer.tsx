'use client';

import { useContext, useEffect, useState } from 'react';

import { Context } from './context-provider.js';

export const ContextConsumer = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // FIXME what should be the best practice for this case?
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const value = useContext(Context);
  return (
    <>
      {mounted && <div data-testid="mounted">true</div>}
      <div data-testid="value">{value}</div>
    </>
  );
};
