let initialRender = true;

export const Slice001 = () => {
  if (initialRender) {
    initialRender = false;
  } else {
    return <h4 data-testid="slice001">Slice 001 (not cached)</h4>;
  }
  return <h4 data-testid="slice001">Slice 001</h4>;
};
