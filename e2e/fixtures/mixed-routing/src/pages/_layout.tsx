import type { ReactNode } from 'react';
import { Link } from 'waku';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header>
        <p>Waku mixed routing</p>
        <nav aria-label="Main">
          <ul>
            <li>
              <Link to="/">Home</Link>
            </li>
            <li>
              <Link to="/about">About</Link>
            </li>
            <li>
              <Link to="/configured">Configured static</Link>
            </li>
            <li>
              <Link to="/hello/Waku">Configured dynamic</Link>
            </li>
          </ul>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}

export const getConfig = async () => ({ render: 'static' as const });
