export default function SliceOne() {
  return (
    <div>
      <h2 className="text-2xl font-bold">
        Slice One {new Date().toLocaleString()}
      </h2>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'static',
  };
};
