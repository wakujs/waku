import classNames from 'classnames';
import styles from './app.module.css';
import './app.css';
import { Counter } from './counter';

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}>
      <title>Waku</title>
      <h1 className={classNames('foo', 'bar')}>Hello {name}!!</h1>
      <h1 className={styles.title}>Hello {name}!!</h1>
      <Counter />
    </div>
  );
};

export default App;
