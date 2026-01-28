import { Link } from 'waku';
import { FastNavigate } from './_components/FastNavigate.js';

const Home = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div>
      <h1>Home</h1>
      <p>now: {now}</p>
      <FastNavigate />
      <div>
        <Link to="/about">About Waku</Link>
      </div>
      <div>
        <Link to="/bar">Counter</Link>
      </div>
    </div>
  );
};

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Home;
