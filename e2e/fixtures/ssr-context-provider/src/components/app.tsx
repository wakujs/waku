import { ContextConsumer } from './context-consumer.js';
import { ContextProvider } from './context-provider.js';

export default function App() {
  return (
    <html>
      <head></head>
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
