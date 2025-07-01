import { Slot } from 'waku/minimal/client';

import { Counter } from './Counter';

const App = ({ name }: { name: string }) => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1>Hello {name}!!</h1>
          <h3>This is a static server component.</h3>
          <Slot id="Dynamic" unstable_fallback={<p>Loading...</p>}>
            <h4>My Counter</h4>
            <Counter />
          </Slot>
          <div>{new Date().toISOString()}</div>
        </div>
      </body>
    </html>
  );
};

export default App;
