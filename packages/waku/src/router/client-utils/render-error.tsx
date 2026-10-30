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
    if (error === null) {
      return this.props.children;
    }
    if (!isNotFoundError(error)) {
      throw error;
    }
    return <h1>Not Found</h1>;
  }
}

export const MissingRouteHandler = ({ children }: { children: ReactNode }) => (
  <MissingRouteBoundary resetKey={useElementsPromise()}>
    {children}
  </MissingRouteBoundary>
);
