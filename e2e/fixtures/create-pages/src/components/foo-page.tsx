import 'server-only';

import { Counter } from './counter.js';

const Foo = () => (
  <div>
    <h2>Foo</h2>
    <Counter />
  </div>
);

export default Foo;
