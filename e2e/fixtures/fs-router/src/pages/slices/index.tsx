import { Slice } from 'waku/router/client';

export default function Slices() {
  return (
    <>
      <h2>Slices</h2>
      <Slice id="slice001" />
      <Slice id="slice002" />
    </>
  );
}

export const getConfig = () => {
  return {
    slices: ['slice001', 'slice002'],
  };
};
