import { Slice } from 'waku/router/client';

const Foo = () => (
  <div>
    <h2 data-testid="foo-title">Foo</h2>
    <Slice id="slice001" />
  </div>
);

export default Foo;
