export default function PresetSlice({ id }: { id: string }) {
  return <h4 data-testid="preset-slice">Preset Slice: {id}</h4>;
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: ['foo', 'bar'],
  } as const;
};
