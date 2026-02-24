import { Link } from 'waku';
import { RaceFastNavigate } from '../components/race-fast-navigate.js';

const RaceHomePage = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div>
      <h1>Home</h1>
      <p>now: {now}</p>
      <RaceFastNavigate />
      <div>
        <Link to="/race-about">About Waku</Link>
      </div>
      <div>
        <Link to="/race-bar">Counter</Link>
      </div>
    </div>
  );
};

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default RaceHomePage;
