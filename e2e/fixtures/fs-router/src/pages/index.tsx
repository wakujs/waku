const Home = () => (
  <div>
    <h1>Home</h1>
    <p>now: {Date.now()}</p>
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Home;
