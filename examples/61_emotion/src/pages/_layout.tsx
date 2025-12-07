import type { ReactNode } from 'react';
import { EmotionRegistry } from '../components/EmotionRegistry';

export default function RootLayout({ children }: { children: ReactNode }) {
  return <EmotionRegistry>{children}</EmotionRegistry>;
}
