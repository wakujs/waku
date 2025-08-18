export default function Slice001() {
  return <h4 data-testid="slice001">Slice 001 ({Math.random()})</h4>;
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    id: 'slice001',
  };
};
