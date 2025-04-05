'use client';

import type { FC } from 'react';
import {
  ErrorBoundary as ReactErrorBoundary,
  type ErrorBoundaryProps,
} from 'react-error-boundary';

const ErrorBoundary: FC<ErrorBoundaryProps> = (props) => {
  return <ReactErrorBoundary {...props} />;
};

export default ErrorBoundary;
