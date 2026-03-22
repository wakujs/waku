import { Slice } from 'waku/router/client';

const Bar2 = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const rand = Math.random();
  return (
    <div>
      <h2 data-testid="bar2-title">Bar2</h2>
      <p data-testid="bar2-random">{rand}</p>
      <Slice id="slice002" />
    </div>
  );
};

export default Bar2;
