'use client';

import { useState } from 'react';
import styled from 'styled-components';

const Button = styled.button`
  border: 1px solid orange;
  padding: 0.5rem 1rem;
  background: transparent;
  cursor: pointer;
  &:hover {
    background: rgba(255, 165, 0, 0.1);
  }
`;

export const Counter = () => {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount((c) => c + 1)}>Count: {count}</Button>;
};
