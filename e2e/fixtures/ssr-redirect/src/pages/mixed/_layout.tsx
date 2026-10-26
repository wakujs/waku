import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <section>
      <h2>Dynamic layout</h2>
      {children}
    </section>
  );
}

export const getConfig = async () => ({ render: 'dynamic' }) as const;
