export default function Slice001() {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const rand = Math.random();
  return <h4 data-testid="slice001">Slice 001 ({rand})</h4>;
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    id: 'slice001',
  };
};
