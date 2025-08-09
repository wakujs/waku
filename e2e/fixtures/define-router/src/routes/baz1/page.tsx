import { Slice } from 'waku/router/client';

const Baz1 = () => (
  <div>
    <h2 data-testid="baz1-title">Baz1</h2>
    <p data-testid="baz1-random">{Math.random()}</p>
    <Slice
      id="slice001"
      lazy
      fallback={<p data-testid="slice001-loading">Loading...</p>}
    />
  </div>
);

export default Baz1;
