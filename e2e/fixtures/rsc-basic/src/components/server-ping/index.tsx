import { ServerBox } from '../box.js';
import { increase, ping, wrap } from './actions.js';
import { Counter } from './counter.js';

export function ServerPing() {
  return (
    <ServerBox data-testid="server-ping">
      <Counter ping={ping} increase={increase} wrap={wrap} />
    </ServerBox>
  );
}
