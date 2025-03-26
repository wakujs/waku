'use client';

import { Component, type ReactNode, createElement } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/**
 * A client-side error boundary component for React applications.
 *
 * Usage:
 * ```tsx
 * // With a static fallback
 * <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * // With a dynamic fallback that receives the error and reset function
 * <ErrorBoundary 
 *   fallback={(error, reset) => (
 *     <div>
 *       <p>Error: {error.message}</p>
 *       <button onClick={reset}>Try Again</button>
 *     </div>
 *   )}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.resetError = this.resetError.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Call the optional onError callback
    this.props.onError?.(error, errorInfo);
    
    // Log the error in development mode
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error caught by ErrorBoundary:', error);
      console.error('Component stack:', errorInfo.componentStack);
    }
  }

  resetError(): void {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      
      // If no fallback is provided, use a generic error message
      if (!fallback) {
        return createElement(
          'div',
          { 
            style: { 
              padding: '16px', 
              margin: '16px 0',
              border: '1px solid #f5c2c7',
              borderRadius: '4px',
              backgroundColor: '#f8d7da', 
              color: '#842029'
            } 
          },
          createElement('p', null, 'Something went wrong.'),
          createElement(
            'button',
            { 
              onClick: this.resetError,
              style: {
                backgroundColor: '#842029',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 12px',
                cursor: 'pointer'
              }
            },
            'Try Again'
          )
        );
      }
      
      // If fallback is a function, call it with the error and reset function
      if (typeof fallback === 'function') {
        return fallback(this.state.error, this.resetError);
      }
      
      // Otherwise, render the fallback directly
      return fallback;
    }
    
    return this.props.children;
  }
} 