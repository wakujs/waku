import { ServerBox } from '../Box.js';
import { increase, ping, wrap } from './actions.js';
import { Counter } from './Counter.js';

export function ServerPing() {
  return (
    <ServerBox data-testid="server-ping">
      <Counter ping={ping} increase={increase} wrap={wrap} />
    </ServerBox>
  );
}
