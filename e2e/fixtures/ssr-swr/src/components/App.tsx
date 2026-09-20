import { Counter } from './Counter.js';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku example</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1 data-testid="app-name">{name}</h1>
          <Counter />
        </div>
      </body>
    </html>
  );
};

export default App;
