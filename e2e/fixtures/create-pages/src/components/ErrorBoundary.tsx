'use client';

import {
  ErrorBoundary as ReactErrorBoundary,
  type ErrorBoundaryProps,
} from 'react-error-boundary';

const ErrorBoundary = (props: ErrorBoundaryProps) => {
  return <ReactErrorBoundary {...props} />;
};

export default ErrorBoundary;
