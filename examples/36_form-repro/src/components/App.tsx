import { TestClient } from "./client";

const App = () => {
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body>
        <div>
          <TestClient serverPromise={Promise.resolve("test")}/>
        </div>
      </body>
    </html>
  );
};

export default App;
