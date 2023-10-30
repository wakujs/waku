import type { ReactNode } from "react";

import { Counter } from "./Counter.js";

const App = ({ name }: { name: string }) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      <Counter enableInnerApp />
    </div>
  );
};

export const AppSkeleton = ({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) => {
  return (
    <div style={{ border: "3px red dashed", margin: "1em", padding: "1em" }}>
      <h1>Hello {name}!!</h1>
      <h3>This is a server component.</h3>
      {children}
    </div>
  );
};

export default App;
