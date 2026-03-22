'use client';

import {
  type ErrorBoundaryProps,
  ErrorBoundary as ReactErrorBoundary,
} from 'react-error-boundary';

const ErrorBoundary = (props: ErrorBoundaryProps) => {
  return <ReactErrorBoundary {...props} />;
};

export default ErrorBoundary;
