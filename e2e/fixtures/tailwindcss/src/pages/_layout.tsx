import { ReactNode } from 'react';
import '../styles.css';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
