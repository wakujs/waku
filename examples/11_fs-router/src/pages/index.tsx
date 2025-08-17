const Home = () => (
  <div>
    <h1>Home</h1>
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Home;
