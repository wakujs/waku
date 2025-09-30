import { unstable_setPlatformData } from 'waku/server';

export default async function Static() {
  if ((globalThis as any).__WAKU_IS_BUILD__ === true) {
    await unstable_setPlatformData('test-custom-platform-data', 'ok', true);
  }
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
