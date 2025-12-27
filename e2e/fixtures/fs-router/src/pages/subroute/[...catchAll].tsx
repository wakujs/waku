import type { PageProps } from 'waku/router';

function SubrouteCatchAll({ catchAll }: PageProps<'/subroute/[...catchAll]'>) {
  return (
    <div>
      <h2>Subroute Catch-All: {catchAll.join('/')}</h2>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};

export default SubrouteCatchAll;
