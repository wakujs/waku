export default function FragmentTargetPage() {
  return (
    <div>
      <p data-testid="fragment-target">Fragment target</p>
      <div style={{ height: 3000 }} />
      <h1 id="comments" data-testid="comments">
        Comments
      </h1>
      <div style={{ height: 3000 }} />
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
