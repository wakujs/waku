'use client';

import { createElement, useContext, useEffect, useState } from 'react';
// Do not add '.js' extension to reproduce the issue
// https://github.com/wakujs/waku/pull/1162
import { Context } from './context-provider';

export const ContextConsumer = () => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // FIXME what should be the best practice for this case?
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const value = useContext(Context);
  return createElement(
    'div',
    null,
    mounted &&
      createElement(
        'div',
        { 'data-testid': 'context-consumer-mounted' },
        'true',
      ),
    createElement('div', { 'data-testid': 'context-consumer-value' }, value),
  );
};
