import type { ReactNode } from 'react';

import { Link } from 'waku/router/client';

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

const HomeLayout = ({ children }: { children: ReactNode }) => (
  <div>
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
        <Link
          to="/bar1"
          unstable_pending={<Pending isPending />}
          unstable_notPending={<Pending isPending={false} />}
        >
          Bar1
        </Link>
      </li>
      <li>
        <Link
          to="/bar2"
          unstable_pending={<Pending isPending />}
          unstable_notPending={<Pending isPending={false} />}
        >
          Bar2
        </Link>
      </li>
      <li>
        <Link
          to="/baz1"
          unstable_pending={<Pending isPending />}
          unstable_notPending={<Pending isPending={false} />}
        >
          Baz1
        </Link>
      </li>
      <li>
        <Link
          to="/baz2"
          unstable_pending={<Pending isPending />}
          unstable_notPending={<Pending isPending={false} />}
        >
          Baz2
        </Link>
      </li>
    </ul>
    {children}
  </div>
);

export default HomeLayout;
