import type { ReactNode } from 'react';

export const DeeplyNestedLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h3>Deeply Nested Layout</h3>
      {children}
    </div>
  );
};
