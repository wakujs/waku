export default function SkipPageB() {
  return (
    <div>
      <h1>SKIP_B_PAGE_MARKER</h1>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
