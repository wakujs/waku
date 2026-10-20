import type { ReactNode } from 'react';
import { CachedRscProbe } from '../components/CachedRscProbe';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <CachedRscProbe />
      {children}
    </>
  );
}

export const getConfig = () => ({ render: 'static' });
