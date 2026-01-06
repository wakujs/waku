'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { Link } from 'waku';

const FallbackComponent = ({ error, resetErrorBoundary }: FallbackProps) => {
  useEffect(() => {
    window.addEventListener('popstate', resetErrorBoundary);
    return () => window.removeEventListener('popstate', resetErrorBoundary);
  }, [resetErrorBoundary]);
  return (
    <div role="alert">
      <p>Unexpected error in client fallback</p>
      <pre style={{ color: 'red' }}>{error.message}</pre>
      {'statusCode' in error && (
        <pre style={{ color: 'red' }}>{String(error.statusCode)}</pre>
      )}
    </div>
  );
};

export const ClientLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div>
      <ul>
        <li>
          <Link to="/">/</Link>
        </li>
        <li>
          <Link to="/dynamic">/dynamic</Link>
        </li>
        <li>
          <Link to="/invalid">Invalid page</Link>
        </li>
        <li>
          <Link to="/suspense">/suspense</Link>
        </li>
        <li>
          <Link to="/no-error">/no-error</Link>
        </li>
      </ul>
      <ErrorBoundary FallbackComponent={FallbackComponent}>
        {children}
      </ErrorBoundary>
    </div>
  );
};
