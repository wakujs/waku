import type { ReactNode } from 'react';

export default function SkipLayout({ children }: { children: ReactNode }) {
  return (
    <main>
      <h2 data-testid="skip-static-layout-marker">SKIP_STATIC_LAYOUT_MARKER</h2>
      {children}
    </main>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
  } as const;
};
