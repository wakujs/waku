export default function SliceTwo() {
  return (
    <div>
      <h2 className="text-2xl font-bold">
        Slice Two {new Date().toLocaleString()}
      </h2>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
    id: 'slice-two',
  };
};
