import { ContextConsumer } from './context-consumer.js';
import { ContextProvider } from './context-provider.js';

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div>
          <ContextProvider>
            <ContextConsumer />
          </ContextProvider>
        </div>
      </body>
    </html>
  );
}
