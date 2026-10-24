import { Link, Slice } from 'waku/router/client';

const Home = () => (
  <div>
    <h2 data-testid="home-title">Home</h2>
    <p>This is the home page.</p>
    <Link to="/typed-redirect">Resolver redirect</Link>
    <Link to="/interceptor-cache">Intercepted static page</Link>
    <Link to="/action-static">Static action page</Link>
    <Link to="/async-cache">Async runtime page</Link>
    <Slice id="slice001" />
  </div>
);

export default Home;
