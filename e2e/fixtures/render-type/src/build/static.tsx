import { unstable_getBuildOptions } from 'waku/server';

export default function Static() {
  return (
    <div>
      [static] phase = {unstable_getBuildOptions().unstable_phase || 'none'}
    </div>
  );
}
