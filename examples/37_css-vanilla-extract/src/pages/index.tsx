// import { Link } from 'waku';

import { Counter } from "../components/counter";
import { serverStyle } from "../server.css";

// import { Counter } from '../components/counter';

export default async function HomePage() {
  // const data = await getData();

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

// const getData = async () => {
//   const data = {
//     title: 'Waku',
//     headline: 'Waku',
//     body: 'Hello world!',
//   };

//   return data;
// };

// export const getConfig = async () => {
//   return {
//     render: 'static',
//   } as const;
// };
