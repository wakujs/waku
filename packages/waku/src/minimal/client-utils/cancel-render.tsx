import { Component } from 'react';
import type { ReactNode } from 'react';
import { isRenderCancellation } from '../../lib/utils-isomorphic/render-cancellation.js';

export class CancelRenderBoundary extends Component<
  { element: unknown; children: (element: unknown) => ReactNode },
  { element: unknown; cancelled: boolean }
> {
  private previousElement: unknown;

  componentDidMount() {
    this.componentDidUpdate();
  }

  componentDidUpdate() {
    if (!this.state.cancelled) {
      this.previousElement = this.props.element;
    }
  }

  state = { element: this.props.element, cancelled: false };

  static getDerivedStateFromProps(
    { element }: { element: unknown },
    state: { element: unknown },
  ) {
    return element === state.element ? null : { element, cancelled: false };
  }

  static getDerivedStateFromError(error: unknown) {
    if (!isRenderCancellation(error)) {
      throw error;
    }
    return { cancelled: true };
  }

  render() {
    return this.props.children(
      this.state.cancelled
        ? (this.previousElement ?? null)
        : this.props.element,
    );
  }
}
