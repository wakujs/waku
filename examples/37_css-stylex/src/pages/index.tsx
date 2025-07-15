import '../index.css';
import { Counter } from '../components/counter';
import * as stylex from '@stylexjs/stylex';

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
      <title>Waku</title>
      <div {...stylex.props(styles.server)}>Server Style (green)</div>
      <div>
        <Counter />
      </div>
    </div>
  );
}
