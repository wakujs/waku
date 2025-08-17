import { unstable_getBuildOptions } from 'waku/server';

export default function Static() {
  return (
    <div>
      [static] phase ={' '}
      <span data-testid="phase">
        {String(!!unstable_getBuildOptions().unstable_phase)}
      </span>
    </div>
  );
}
