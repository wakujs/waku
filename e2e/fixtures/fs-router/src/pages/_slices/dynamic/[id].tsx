export default function DynamicSlice({ id }: { id: string }) {
  return <h4 data-testid="dynamic-slice">Dynamic Slice: {id}</h4>;
}

export const getConfig = () => ({ render: 'dynamic' });
