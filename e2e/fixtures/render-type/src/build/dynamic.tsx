import { unstable_getBuildOptions } from 'waku/server';

export default function Dynamic() {
  return (
    <div>
      [dynamic] phase = {unstable_getBuildOptions().unstable_phase || 'none'}
    </div>
  );
}
