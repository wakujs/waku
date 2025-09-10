import type { ReactNode } from 'react';

import { RouterProvider } from 'waku-jotai/router';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return <RouterProvider>{children}</RouterProvider>;
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
