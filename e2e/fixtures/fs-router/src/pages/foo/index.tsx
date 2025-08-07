import { Counter } from '../_components/Counter.js';

const Foo = () => (
  <div>
    <h2>Foo</h2>
    <Counter />
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Foo;
