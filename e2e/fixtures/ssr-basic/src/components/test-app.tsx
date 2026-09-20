// https://github.com/wakujs/waku/pull/1539

import { TestClient } from './test-client.js';

const TestApp = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku</title>
      </head>
      <body>
        <div>
          <TestClient />
        </div>
      </body>
    </html>
  );
};

export default TestApp;
