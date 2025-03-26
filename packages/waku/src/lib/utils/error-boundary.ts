import { createElement } from 'react';
import type { ReactNode } from 'react';
import { DevModeErrorBoundary, ErrorBoundary } from '../../router/client.js';

/**
 * ConfigurableErrorBoundary automatically selects the appropriate error boundary based on environment.
 * In development mode, it provides detailed error information.
 * In production mode, it uses a minimal error UI.
 */
export const ConfigurableErrorBoundary = ({ 
  children, 
  isDevelopment = process.env.NODE_ENV !== 'production',
}: { 
  children: ReactNode; 
  isDevelopment?: boolean;
}) => {
  // Use the development error boundary when in dev mode
  if (isDevelopment) {
    return createElement(DevModeErrorBoundary, { children }, children);
  }
  
  // Use the production error boundary otherwise
  return createElement(ErrorBoundary, { children }, children);
}; 