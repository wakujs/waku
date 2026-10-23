import { Link, Slice } from 'waku/router/client';

const Home = () => (
  <div>
    <h2 data-testid="home-title">Home</h2>
    <p>This is the home page.</p>
    <Link to="/typed-redirect">Resolver redirect</Link>
    <Slice id="slice001" />
  </div>
);

export default Home;
