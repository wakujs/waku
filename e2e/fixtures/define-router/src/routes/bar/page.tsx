import { Slice } from 'waku/router/client';

const Bar = () => (
  <div>
    <h2 data-testid="bar-title">Bar</h2>
    <Slice id="slice001" />
  </div>
);

export default Bar;
