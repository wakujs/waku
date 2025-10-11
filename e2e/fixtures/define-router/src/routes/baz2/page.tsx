import { Slice } from 'waku/router/client';

const Baz2 = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const rand = Math.random();
  return (
    <div>
      <h2 data-testid="baz2-title">Baz2</h2>
      <p data-testid="baz2-random">{rand}</p>
      <Slice
        id="slice002"
        lazy
        fallback={<p data-testid="slice002-loading">Loading...</p>}
      />
    </div>
  );
};

export default Baz2;
