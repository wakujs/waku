import styles from './app.module.css';
import { ClientCounter } from './ClientCounter.js';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku example</title>
      </head>
      <body>
        <div data-testid="app-wrapper" className={styles.wrapper}>
          <p className={styles.text} data-testid="app-name">
            {name}
          </p>
          <ClientCounter />
        </div>
      </body>
    </html>
  );
};

export default App;
