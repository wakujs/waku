import { RouteState } from '../components/route-state.js';

export default function InterceptedPage() {
  return (
    <div>
      <h1>Intercepted</h1>
      <RouteState />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
