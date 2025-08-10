import { Slice } from 'waku/router/client';

const Bar1 = () => (
  <div>
    <h2 data-testid="bar1-title">Bar1</h2>
    <p data-testid="bar1-random">{Math.random()}</p>
    <Slice id="slice001" />
  </div>
);

export default Bar1;
