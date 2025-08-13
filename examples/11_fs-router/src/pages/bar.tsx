import { Counter } from './_components/Counter';

const Bar = () => (
  <div>
    <h2>Bar</h2>
    <Counter />
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Bar;
