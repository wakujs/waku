import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'waku';

export const SlowComponent = async ({ children }: { children?: ReactNode }) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return <div>{children || 'Slow Component'}</div>;
};

export const StaticLongSuspenseLayout = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <div>
      <h2>Static Long Suspense Layout</h2>
      <Link to="/static-long-suspense/4" unstable_pending="...">
        Click Me
      </Link>
      <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
    </div>
  );
};

export const LongSuspenseLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h2>Long Suspense Layout</h2>
      <Link to="/long-suspense/2">Click Me</Link>
      <Suspense fallback={<div data-testid="long-suspense">Loading...</div>}>
        <SlowComponent />
      </Suspense>
      {children}
    </div>
  );
};
