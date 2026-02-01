import type { ReactNode } from 'react';

const NestedLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h3>Nested Layout</h3>
      {children}
    </div>
  );
};

export default NestedLayout;
