const Subroute = () => (
  <div>
    <h2>Subroute</h2>
  </div>
);

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default Subroute;
