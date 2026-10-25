const NoSsr = () => (
  <div>
    <h2>No SSR from getConfig</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'static',
    unstable_noSsr: true,
  } as const;
};

export default NoSsr;
