import type { ReactNode } from 'react';

export default function Slice002({ children }: { children?: ReactNode }) {
  return <h4 data-testid="slice002">Slice 002: {children}</h4>;
}

export const getConfig = () => {
  return {
    render: 'static',
  };
};
