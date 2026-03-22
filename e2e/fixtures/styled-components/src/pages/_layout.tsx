import type { ReactNode } from 'react';
import { StyledComponentsRegistry } from '../components/StyledComponentsRegistry';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <StyledComponentsRegistry>{children}</StyledComponentsRegistry>;
}
