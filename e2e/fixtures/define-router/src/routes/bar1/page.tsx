import { Slice } from 'waku/router/client';

const Bar1 = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const rand = Math.random();
  return (
    <div>
      <h2 data-testid="bar1-title">Bar1</h2>
      <p data-testid="bar1-random">{rand}</p>
      <Slice id="slice001" />
    </div>
  );
};

export default Bar1;
