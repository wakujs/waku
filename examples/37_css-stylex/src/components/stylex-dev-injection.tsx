'use client';

import { useEffect } from 'react';

function DevStyleXInjectImpl() {
  useEffect(() => {
    // @ts-expect-error virtual module
    // eslint-disable-next-line import/no-unresolved
    void import('virtual:stylex:css-only');
  }, []);
  return <link rel="stylesheet" href="/virtual:stylex.css" />;
}

export const DevStyleXInject = import.meta.env.DEV
  ? DevStyleXInjectImpl
  : () => null;
