import { ServerBox } from '../Box.js';
import { throws } from './actions.js';
import { Counter } from './Counter.js';

export function ServerThrows() {
  return (
    <ServerBox data-testid="server-throws">
      <Counter throws={throws} />
    </ServerBox>
  );
}
