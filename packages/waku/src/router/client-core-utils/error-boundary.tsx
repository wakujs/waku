import { Component } from 'react';
import type { ContextType, ErrorInfo, ReactNode } from 'react';
import { unstable_isRenderCancellation as isRenderCancellation } from 'waku/minimal/client';
import { RouterHostContext } from './host.js';

export const isNotFoundError = (error: unknown) =>
  error instanceof Error &&
  error.cause instanceof Response &&
  error.cause.status === 404;

function renderError(message: string, notFound: boolean) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{notFound ? 'Not Found' : 'Unhandled Error'}</title>
      </head>
      <body
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          placeContent: 'center',
          placeItems: 'center',
          fontSize: '16px',
          margin: 0,
        }}
      >
        <h1>{notFound ? 'Not Found' : 'Caught an unexpected error'}</h1>
        {!notFound && <p>Error: {message}</p>}
      </body>
    </html>
  );
}

/**
 * Catches errors from its children and shows a fallback page. Used by the
 * default root layout; apps can wrap their own root with it too.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failure?: { error: unknown } | undefined }
> {
  static contextType = RouterHostContext;
  declare context: ContextType<typeof RouterHostContext>;
  private failedRoute: { key: unknown } | undefined;

  state: { failure?: { error: unknown } | undefined } = {};

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.failedRoute = { key: this.context?.route };
  }

  componentDidUpdate() {
    // A reload can replace route data without changing its URL.
    if (this.failedRoute && this.failedRoute.key !== this.context?.route) {
      this.failedRoute = undefined;
      this.setState({ failure: undefined });
    }
  }

  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } };
  }

  render() {
    if (this.state.failure) {
      const { error } = this.state.failure;
      if (isRenderCancellation(error)) {
        throw error;
      }
      return renderError(
        error instanceof Error ? error.message : String(error),
        isNotFoundError(error),
      );
    }
    return this.props.children;
  }
}
