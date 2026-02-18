import { RouteState } from '../components/route-state.js';

export default function NextPage() {
  return (
    <div>
      <h1>Next</h1>
      <RouteState />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
