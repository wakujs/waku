import { unstable_getPlatformData } from 'waku/server';

export default async function Dynamic() {
  const platformData = await unstable_getPlatformData(
    'test-custom-platform-data',
  );
  return (
    <div>
      [dynamic]
      <div>
        phase =
        <span data-testid="phase">
          {/*
            FIXME How can we do the test?
            String(!!unstable_getBuildOptions().unstable_phase)
          */}
        </span>
      </div>
      <div>
        platformData =
        <span data-testid="platform-data">{String(platformData)}</span>
      </div>
    </div>
  );
}
