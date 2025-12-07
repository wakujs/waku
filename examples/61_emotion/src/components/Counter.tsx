'use client';

import { useState } from 'react';
import styled from '@emotion/styled';

const Button = styled.button`
  border: 1px solid teal;
  padding: 0.5rem 1rem;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: rgba(0, 128, 128, 0.1);
  }
`;

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <Button onClick={() => setCount((c) => c + 1)}>Count: {count}</Button>
  );
};
