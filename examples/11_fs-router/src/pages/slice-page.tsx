import { Slice } from 'waku/router/client';

export default function SlicePage() {
  return (
    <div>
      <h2>Slice Page</h2>
      <Slice id="one" />
      <Slice id="two" />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    slices: ['one', 'two'],
  };
};
