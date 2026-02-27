import { RaceCounter } from '../components/race-counter.js';

const RaceBarPage = () => (
  <div>
    <h2>Bar</h2>
    <RaceCounter />
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default RaceBarPage;
