export default async function Dynamic() {
  return (
    <div>
      [dynamic]
      <div>
        phase =
        <span data-testid="phase">
          {String((globalThis as any).__WAKU_IS_BUILD__ === true)}
        </span>
      </div>
    </div>
  );
}
