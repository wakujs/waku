import { Slice } from 'waku/router/client';

const slices = ['slice001', '-two'] as const;

export default function Slices() {
  return (
    <>
      <h2>Slices</h2>
      <Slice id={slices[0]} />
      <Slice id={slices[1]} />
    </>
  );
}

export const getConfig = () => {
  return {
    slices,
  };
};
