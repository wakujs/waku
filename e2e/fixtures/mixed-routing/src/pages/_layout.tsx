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
            {/* shortcut: use document navigation while typegen omits virtual routes. */}
            <li>
              <a href="/configured">Configured static</a>
            </li>
            <li>
              <a href="/hello/Waku">Configured dynamic</a>
            </li>
          </ul>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}

export const getConfig = async () => ({ render: 'static' as const });
