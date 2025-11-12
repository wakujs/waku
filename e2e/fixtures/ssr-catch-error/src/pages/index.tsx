import { ErrorBoundary } from 'react-error-boundary';
import ThrowsComponent from '../components/server/throws.js';

export default async function HomePage() {
  return (
    <div>
      <p>Home Page</p>
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <ThrowsComponent />
      </ErrorBoundary>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
