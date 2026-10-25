import { Link, Slice } from 'waku/router/client';
import { RedirectControls } from '../components/redirect-controls.js';

const Home = () => (
  <div>
    <h2 data-testid="home-title">Home</h2>
    <p>This is the home page.</p>
    <Link to="/typed-redirect">Resolver redirect</Link>
    <RedirectControls />
    <Link to="/fragment-ready">Fragment ready</Link>
    <Link to="/fragment-late">Fragment late</Link>
    <Link to="/interceptor-cache">Intercepted static page</Link>
    <Link to="/action-static">Static action page</Link>
    <Link to="/async-cache">Async runtime page</Link>
    <Slice id="slice001" />
  </div>
);

export default Home;
