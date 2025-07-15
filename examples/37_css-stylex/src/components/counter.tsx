'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  client: {
    borderWidth: '1px',
    borderColor: 'orange',
    borderStyle: 'solid',
    padding: '0.5rem',
    margin: '0.5rem',
  },
});

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <button
      {...stylex.props(styles.client)}
      onClick={() => setCount((c) => c + 1)}
    >
      Client Style: {count} (orange)
    </button>
  );
};
