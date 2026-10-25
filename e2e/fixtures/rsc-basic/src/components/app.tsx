// no "use server" detective

import { ServerBox } from './box.js';
import { ClientCounter, someConfigs } from './client-counter.js';
import { ClientActionsConsumer } from './server-action/client.js';
import { ServerProvider } from './server-action/server.js';
import { ServerPing } from './server-ping/index.js';
import { ServerThrows } from './server-throws/index.js';

const App = ({
  name,
  params,
  metadata,
}: {
  name: string;
  params: unknown;
  metadata: string | undefined;
}) => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku example</title>
      </head>
      <body>
        <p data-testid="build-metadata">{metadata}</p>
        <ServerBox>
          <p data-testid="app-name">{name}</p>
          <ClientCounter params={params} />
          <ServerPing />
          <ServerProvider>
            <ClientActionsConsumer />
          </ServerProvider>
          <ServerThrows />
          <p data-testid="some-config-foo">{someConfigs.foo}</p>
        </ServerBox>
      </body>
    </html>
  );
};

export default App;
