import { Counter } from "../components/counter";
import { serverStyle } from "../server.css";

export default async function HomePage() {
  return (
    <div>
      <div className={serverStyle}>
        Server Style (green)
      </div>
      <div>
        <Counter />
      </div>
    </div>
  );
}
