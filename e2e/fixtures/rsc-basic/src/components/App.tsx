// no "use server" detective

import { ClientCounter, someConfigs } from './ClientCounter.js';
import { ServerPing } from './ServerPing/index.js';
import { ServerBox } from './Box.js';
import { ServerProvider } from './ServerAction/Server.js';
import { ClientActionsConsumer } from './ServerAction/Client.js';
import { ServerThrows } from './ServerThrows/index.js';

const App = ({ name, params }: { name: string; params: unknown }) => {
  return (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
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
