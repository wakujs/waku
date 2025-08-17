import { unstable_getBuildOptions } from 'waku/server';

export default function Dynamic() {
  return (
    <div>
      [dynamic] phase = <span data-testid="phase">{String(!!unstable_getBuildOptions().unstable_phase)}</span>
    </div>
  );
}
