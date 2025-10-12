import { throws } from '../funcs.js';
import { Counter } from './Counter.js';

export function ServerThrows() {
  return (
    <div data-testid="server-throws">
      <Counter throws={throws} />
    </div>
  );
}
