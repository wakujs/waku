import { Slice } from 'waku/router/client';

export default function SlicePage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Slice Page</h2>
      <Slice id="slice-0" />
      <Slice id="slice-1" />
    </div>
  );
}
