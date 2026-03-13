import '../index.css';
import * as stylex from '@stylexjs/stylex';
import { Counter } from '../components/counter';
import { DevStyleXInject } from '../components/stylex-dev-injection';

const styles = stylex.create({
  server: {
    borderWidth: '1px',
    borderColor: 'green',
    borderStyle: 'solid',
    padding: '0.5rem',
    margin: '0.5rem',
  },
});

export default async function HomePage() {
  return (
    <div>
      <DevStyleXInject />
      <title>Waku</title>
      <div {...stylex.props(styles.server)}>Server Style (green)</div>
      <div>
        <Counter />
      </div>
    </div>
  );
}
