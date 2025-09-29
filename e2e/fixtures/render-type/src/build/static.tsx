import { unstable_setPlatformData } from 'waku/server';

export default async function Static() {
  await unstable_setPlatformData('test-custom-platform-data', 'ok', true);
  return (
    <div>
      [static]
      <div>
        phase ={' '}
        <span data-testid="phase">
          {/*
            FIXME How can we do the test?
            String(!!unstable_getBuildOptions().unstable_phase)
          */}
        </span>
      </div>
    </div>
  );
}
