export const Slice002 = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const rand = Math.random();
  return <h4 data-testid="slice002">Slice 002 ({rand})</h4>;
};
