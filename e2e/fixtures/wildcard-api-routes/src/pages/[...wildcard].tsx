const Page = ({ wildcard }: { wildcard: string[] }) => (
  <div>
    <h1>/{wildcard.join('/')}</h1>
    <p>Catch All Pages Route</p>
  </div>
);

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};

export default Page;
