import { Slice } from 'waku/router/client';

const Baz = () => (
  <div>
    <h2 data-testid="baz-title">Baz</h2>
    <Slice
      id="slice002"
      delayed
      fallback={<p data-testid="slice002-loading">Loading...</p>}
    />
  </div>
);

export default Baz;
