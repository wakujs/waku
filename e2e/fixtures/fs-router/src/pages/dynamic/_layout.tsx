import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Link } from 'waku';

type LoaderLayoutProps = { children: ReactNode };

export default async function LoaderLayout({ children }: LoaderLayoutProps) {
  return (
    <div>
      <nav>
        <Link to="/dynamic/one" unstable_pending="Pending Dynamic One">
          Dynamic One With Transition
        </Link>
        <Link to="/dynamic/two" unstable_pending="Pending Dynamic Two">
          Dynamic Two With Transition
        </Link>
        <Link to="/dynamic/three">Dynamic Three Without Transition</Link>
      </nav>
      <Suspense fallback="Loading...">{children}</Suspense>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
