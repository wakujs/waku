import type { ReactNode } from 'react';
import { StyledComponentsRegistry } from '../components/styled-components-registry';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <StyledComponentsRegistry>{children}</StyledComponentsRegistry>;
}
