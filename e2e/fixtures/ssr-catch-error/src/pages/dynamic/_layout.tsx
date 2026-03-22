import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import ThrowsComponent from '../../components/server/throws.js';

export default async function DynamicLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      <ErrorBoundary fallback={<div>Something is wrong</div>}>
        <ThrowsComponent />
      </ErrorBoundary>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
