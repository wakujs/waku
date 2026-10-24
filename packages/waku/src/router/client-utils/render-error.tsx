import { Component } from 'react';
import type { ReactNode } from 'react';
import { useElementsPromise_UNSTABLE as useElementsPromise } from 'waku/minimal/client';
import { isNotFoundError } from '../client-core-utils/error-boundary.js';

export const RenderError = ({ error }: { error: unknown }): never => {
  throw error;
};

class MissingRouteBoundary extends Component<
  { children?: ReactNode; resetKey: unknown },
  { error: unknown | null; resetKey: unknown }
> {
  constructor(props: { children?: ReactNode; resetKey: unknown }) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }
  static getDerivedStateFromProps(
    props: { resetKey: unknown },
    state: { resetKey: unknown },
  ) {
    return props.resetKey === state.resetKey
      ? null
      : { error: null, resetKey: props.resetKey };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    return error === null ? (
      this.props.children
    ) : isNotFoundError(error) ? (
      <h1>Not Found</h1>
    ) : (
      <RenderError error={error} />
    );
  }
}

export const MissingRouteHandler = ({ children }: { children: ReactNode }) => (
  <MissingRouteBoundary resetKey={useElementsPromise()}>
    {children}
  </MissingRouteBoundary>
);
