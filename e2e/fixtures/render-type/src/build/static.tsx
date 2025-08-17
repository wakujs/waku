import {
  unstable_getBuildOptions,
  unstable_setPlatformData,
} from 'waku/server';

export default async function Static() {
  if (unstable_getBuildOptions().unstable_phase) {
    await unstable_setPlatformData('test-custom-platform-data', 'ok', true);
  }
  return (
    <div>
      [static]
      <div>
        phase ={' '}
        <span data-testid="phase">
          {String(!!unstable_getBuildOptions().unstable_phase)}
        </span>
      </div>
    </div>
  );
}
