import type { ReactNode } from 'react';
import { Link } from 'waku';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <div>
      <h3>Waku + Cloudflare</h3>
      <ul>
        <li>
          <Link to="/">dynamic</Link>
        </li>
        <li>
          <Link to="/static">static</Link>
        </li>
      </ul>
      <div>{children}</div>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
