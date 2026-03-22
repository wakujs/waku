import { RouteState } from '../components/route-state.js';

export default function ViewTargetPage() {
  return (
    <div>
      <h1>View Target</h1>
      <RouteState />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
