import { Slice } from 'waku/router/client';

const Home = () => (
  <div>
    <h2 data-testid="home-title">Home</h2>
    <p>This is the home page.</p>
    <Slice id="slice001" />
    <Slice id="slice002" />
  </div>
);

export default Home;
