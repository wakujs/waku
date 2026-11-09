const Page = () => (
  <div>
    <h2>Exact path</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'static',
    exactPath: true,
  } as const;
};

export default Page;
