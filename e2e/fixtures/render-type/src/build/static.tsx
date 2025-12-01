export default async function Static() {
  return (
    <div>
      [static]
      <div>
        phase ={' '}
        <span data-testid="phase">
          {String((globalThis as any).__WAKU_IS_BUILD__ === true)}
        </span>
      </div>
    </div>
  );
}
