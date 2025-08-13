import { Suspense } from 'react';
import { preload } from 'react-dom';

import { Counter } from './Counter.js';
import { AIProvider } from '../ai/index.js';
import { AIClient } from './AIClient.js';
import { TestEnvServer } from './test-env/server.js';
import { TestEnvClient } from './test-env/client.js';
import config from '../../private/config.js';

const DelayedBackground = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <link href="background.css" rel="stylesheet" />;
};

const App = ({ name }: { name: string }) => {
  preload('background.css', { as: 'style' });
  return (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
        <script id="embedding-data" type="application/json">
          {`{ "a": 1 }`}
        </script>
        <div
          style={{ border: '3px red dashed', margin: '1em', padding: '1em' }}
        >
          <h1 data-testid="app-name">{name}</h1>
          <Counter />
          <section data-testid="vercel-ai">
            <AIProvider>
              <AIClient />
            </AIProvider>
          </section>
          <Suspense fallback="Loading...">
            <DelayedBackground />
          </Suspense>
          <section>
            <h2>TestEnvServer</h2>
            <div data-testid="test-env-server">
              <TestEnvServer />
            </div>
          </section>
          <section>
            <h2>TestEnvClient</h2>
            <div data-testid="test-env-client">
              <TestEnvClient />
            </div>
          </section>
          <section>
            <h2>Private Config</h2>
            <div data-testid="private-content">{config.content}</div>
          </section>
        </div>
      </body>
    </html>
  );
};

export default App;
