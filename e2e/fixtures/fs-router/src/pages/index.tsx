const Home = () => {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <div>
      <h1>Home</h1>
      <p>now: {now}</p>
    </div>
  );
};

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Home;
