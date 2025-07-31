import { Slice } from 'waku/router/client';

const Baz = () => (
  <div>
    <h2 data-testid="baz-title">Baz</h2>
    <p data-testid="baz-random">{Math.random()}</p>
    <Slice
      id="slice002"
      lazy
      fallback={<p data-testid="slice002-loading">Loading...</p>}
    />
  </div>
);

export default Baz;
