'use client';

import { Component } from 'react';
import type { ReactNode } from 'react';

// Router renders the document, so the fallback renders <html> and <body>.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <html>
          <body>
            <p data-testid="follow-error">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </body>
        </html>
      );
    }
    return this.props.children;
  }
}
