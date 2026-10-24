import { Component } from 'react';
import type { ReactNode } from 'react';
import { isRenderCancellation } from '../../lib/utils-isomorphic/render-cancellation.js';

export class CancelRenderBoundary extends Component<
  { element: unknown; children: (element: unknown) => ReactNode },
  { element: unknown; failure: { error: unknown } | undefined }
> {
  private previousElement: unknown;

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate() {
    if (!this.state.failure) {
      this.previousElement = this.props.element;
    }
  }

  state = {
    element: this.props.element,
    failure: undefined as { error: unknown } | undefined,
  };

  static getDerivedStateFromProps(
    { element }: { element: unknown },
    state: { element: unknown },
  ) {
    return element === state.element ? null : { element, failure: undefined };
  }

  static getDerivedStateFromError(error: unknown) {
    return { failure: { error } };
  }

  render() {
    const failure = this.state.failure;
    if (failure && !isRenderCancellation(failure.error)) {
      throw failure.error;
    }
    return this.props.children(
      failure ? (this.previousElement ?? null) : this.props.element,
    );
  }
}
