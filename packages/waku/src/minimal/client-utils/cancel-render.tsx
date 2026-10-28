import { Component } from 'react';
import type { ReactNode } from 'react';
import { hasRenderCancellationDigest } from '../../lib/utils-isomorphic/render-cancellation.js';

class CancellationBoundary extends Component<
  { children: ReactNode; retain?: boolean },
  { element: ReactNode; failure: { error: unknown } | undefined }
> {
  private previousElement: ReactNode;

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate() {
    if (this.props.retain && !this.state.failure) {
      this.previousElement = this.props.children;
    }
  }

  state = {
    element: this.props.children,
    failure: undefined as { error: unknown } | undefined,
  };

  static getDerivedStateFromProps(
    { children }: { children: ReactNode },
    state: { element: ReactNode },
  ) {
    return children === state.element
      ? null
      : { element: children, failure: undefined };
  }

  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } };
  }

  render() {
    const failure = this.state.failure;
    if (!failure) {
      return this.props.children;
    }
    if (!hasRenderCancellationDigest(failure.error)) {
      throw failure.error;
    }
    return this.props.retain ? (this.previousElement ?? null) : null;
  }
}

export function CancelRenderBoundary({ children }: { children: ReactNode }) {
  return (
    <CancellationBoundary>
      <CancellationBoundary retain>{children}</CancellationBoundary>
    </CancellationBoundary>
  );
}
