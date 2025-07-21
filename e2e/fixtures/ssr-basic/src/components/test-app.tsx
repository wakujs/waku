// https://github.com/wakujs/waku/pull/1539

import { TestClient } from './test-client.js';

const TestApp = () => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div>
          <TestClient serverPromise={Promise.resolve('test')} />
        </div>
      </body>
    </html>
  );
};

export default TestApp;
