import '../styles.css';
import { Link } from 'waku';
import type { ReactNode } from 'react';
import { Hydrated } from '../components/hydrated';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      <ul>
        <li>
          <Link to="/">Home</Link>
        </li>
        <li>
          <Link to="/about">About</Link>
        </li>
      </ul>
      <Hydrated />
      {children}
    </div>
  );
}
