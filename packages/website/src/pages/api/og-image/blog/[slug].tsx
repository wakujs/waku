import { getPostPaths } from '../../../../lib/get-file-name';
import { ImageResponse } from '@vercel/og';

export const GET = async () => {
  return new ImageResponse(<Root title="Waku" />, {
    width: 843,
    height: 441,
  });
};

function Root(props: { title: string }) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#171717',
        backgroundColor: '#ffffff',
        width: '100%',
        height: '100%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '48px',
          fontWeight: '600',
        }}
      >
        {props.title}
      </div>
    </div>
  );
}

export const getConfig = async () => {
  const blogPaths = await getPostPaths('./private/contents');

  return {
    render: 'static',
    staticPaths: blogPaths,
  } as const;
};
