import { Counter } from './counter';
import { Greeting } from './greeting';

export function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku SPA</title>
      </head>
      <body>
        <h1 data-testid="title">Hello Client</h1>
        <Counter />
        <Greeting />
      </body>
    </html>
  );
}
