import type { ReactNode } from 'react';
import { Link } from 'waku/router/client';

import '../styles.css';

const Pending = ({ isPending }: { isPending: boolean }) => (
  <span
    style={{
      marginLeft: 5,
      transition: 'opacity 75ms 100ms',
      opacity: isPending ? 1 : 0,
    }}
  >
    Pending...
  </span>
);

let renderCount = 0;

const HomeLayout = ({ children }: { children: ReactNode }) => {
  ++renderCount;
  return (
    <div>
      <title>Waku</title>
      <ul>
        <li>
          <Link
            to="/"
            unstable_pending={<Pending isPending />}
            unstable_notPending={<Pending isPending={false} />}
          >
            Home
          </Link>
        </li>
        <li>
          <Link
            to="/foo"
            unstable_pending={<Pending isPending />}
            unstable_notPending={<Pending isPending={false} />}
          >
            Foo
          </Link>
        </li>
        <li>
          <Link to="/bar" unstable_prefetchOnEnter>
            Bar
          </Link>
        </li>
        <li>
          <Link to="/baz">Baz</Link>
        </li>
        <li>
          <Link to="/nested/foo">Nested / Foo</Link>
        </li>
        <li>
          <Link to="/nested/bar">Nested / Bar</Link>
        </li>
        <li>
          <Link to="/nested/baz">Nested / Baz</Link>
        </li>
        <li>
          <Link to="/nested/qux">Nested / Qux</Link>
        </li>
        <li>
          <Link to="/error">Error</Link>
        </li>
        <li>
          <Link to="/exact/[slug]/[...wild]">Exact Path</Link>
        </li>
        <li>
          <Link to="/nested-layouts">Nested Layouts</Link>
        </li>
        <li>
          <Link to="/slices">Slices</Link>
        </li>
      </ul>
      {children}
      <h4 data-testid="home-layout-render-count">
        Render Count: {renderCount}
      </h4>
    </div>
  );
};

export default HomeLayout;
