const Page = () => (
  <div>
    <h2>Static Foo</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'static',
  } as const;
};

export default Page;
