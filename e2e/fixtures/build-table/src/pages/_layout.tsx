import type { ReactNode } from 'react';
type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return children;
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
