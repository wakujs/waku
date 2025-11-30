import '../styles.css';
import type { ReactNode } from 'react';
import { Link } from 'waku';
import { Hydrated } from '../components/hydrated';
import { ClickLink } from '../components/router';

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
        <li>
          <ClickLink to="/dynamic">dynamic-push</ClickLink>
        </li>
        <li>
          <ClickLink to="/dynamic" replace>
            dynamic-replace
          </ClickLink>
        </li>
      </ul>
      <Hydrated />
      <div className="test-style">test-style</div>
      {children}
    </div>
  );
}
