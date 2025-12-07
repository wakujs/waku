import type { ReactNode } from 'react';
import { StyledJsxRegistry } from '../components/StyledJsxRegistry';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <StyledJsxRegistry>{children}</StyledJsxRegistry>;
}
