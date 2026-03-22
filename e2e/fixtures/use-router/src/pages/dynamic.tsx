import { Link } from 'waku';
import { MyButton } from '../components/my-button.js';
import TestRouter from '../TestRouter.js';

let dynamicRenderCount = 0;

const Page = () => (
  <>
    <h1>Dynamic</h1>
    <p data-testid="dynamic-render-count">
      Render count: {++dynamicRenderCount}
    </p>
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
