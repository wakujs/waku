import { Link } from 'waku';
import { RouteState } from '../components/route-state.js';

export default function NotFoundPage() {
  return (
    <div>
      <h1>Custom 404</h1>
      <RouteState />
      <p>
        <Link to="/start" data-testid="go-start-from-404">
          Back to start
        </Link>
      </p>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
