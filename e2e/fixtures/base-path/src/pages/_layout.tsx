import '../styles.css';
import type { ReactNode } from 'react';
import { Link } from 'waku';
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
          <Link to="/static">Static</Link>
        </li>
        <li>
          <Link to="/dynamic">Dynamic</Link>
        </li>
      </ul>
      <Hydrated />
      <div className="test-style">test-style</div>
      {children}
    </div>
  );
}
