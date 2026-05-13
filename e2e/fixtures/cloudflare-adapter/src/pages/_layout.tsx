import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <span data-testid="layout-marker">LAYOUT_MARKER</span>
      {children}
    </div>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
