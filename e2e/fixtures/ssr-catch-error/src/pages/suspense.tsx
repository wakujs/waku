import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import ThrowsComponent from '../components/server/throws.js';

export default async function HomePage() {
  return (
    <div>
      <p>Error inside Suspense inside ErrorBoundary</p>
      <ErrorBoundary fallback={<div>ErrorBoundary fallback</div>}>
        <Suspense fallback={<div>Suspense fallback</div>}>
          <ThrowsComponent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
