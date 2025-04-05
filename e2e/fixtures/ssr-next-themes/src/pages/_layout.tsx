import { ReactNode } from 'react';
import { Layout } from '../components/Layout.js';

type RootLayoutProps = { children: ReactNode; path: string };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <Layout>
      <main>{children}</main>
    </Layout>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  };
};
