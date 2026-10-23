import { Component } from 'react';
import type { ReactNode } from 'react';

export const RenderError = ({ error }: { error: unknown }) => {
  if (
    error instanceof Error &&
    error.cause instanceof Response &&
    error.cause.status === 404
  ) {
    return <h1>Not Found</h1>;
  }
  throw error;
};

export class MissingRouteHandler extends Component<
  { children?: ReactNode },
  { error: unknown | null }
> {
  constructor(props: { children?: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    return error === null ? this.props.children : <RenderError error={error} />;
  }
}
