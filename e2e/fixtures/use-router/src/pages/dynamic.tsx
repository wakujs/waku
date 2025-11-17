import { Link } from 'waku';
import { MyButton } from '../components/my-button.js';
import TestRouter from '../TestRouter.js';

const Page = () => (
  <>
    <h1>Dynamic</h1>
    <p>
      <Link to="/static">Go to static</Link>
      <MyButton />
    </p>
    <TestRouter />
  </>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Page;
