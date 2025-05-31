import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'waku';

export const SlowComponent = async ({ children }: { children?: ReactNode }) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return (
    <div data-testid="long-suspense-component">
      {children || 'Slow Component'}
    </div>
  );
};

export const StaticLongSuspenseLayout = ({
  children,
}: {
  children: ReactNode;
}) => {
  return (
    <div>
      <h2>Static Long Suspense Layout</h2>
      <div>
        <Link
          to="/static-long-suspense/5"
          unstable_pending={
            <div data-testid="long-suspense-pending">Pending...</div>
          }
        >
          Click Me
        </Link>
      </div>
      <div>
        <Link to="/static-long-suspense/6">Click Me Too</Link>
      </div>
      <Suspense fallback={<div data-testid="long-suspense">Loading...</div>}>
        <SlowComponent />
        {children}
      </Suspense>
    </div>
  );
};

export const LongSuspenseLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <h2>Long Suspense Layout</h2>
      <div>
        <Link
          to="/long-suspense/2"
          unstable_pending={
            <div data-testid="long-suspense-pending">Pending...</div>
          }
        >
          Click Me
        </Link>
      </div>
      <div>
        <Link to="/long-suspense/3">Click Me Too</Link>
      </div>
      <Suspense fallback={<div data-testid="long-suspense">Loading...</div>}>
        <SlowComponent />
        {children}
      </Suspense>
    </div>
  );
};
