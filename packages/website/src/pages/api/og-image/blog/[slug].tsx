import { ImageResponse } from '@vercel/og';
import { compilePost } from '../../../../components/post-page';
import { getPostPaths } from '../../../../lib/get-file-name';

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const slug = url.pathname.split('/').pop();
  if (!slug) {
    return notFound();
  }

  const result = await compilePost({ folder: './private/contents', slug });
  if (!result) {
    return notFound();
  }

  return new ImageResponse(
    <OgImageBlogPost title={result.frontmatter.title} />,
    {
      width: 843,
      height: 441,
    },
  );
};

function notFound() {
  return new Response('Not Found', { status: 404 });
}

function OgImageBlogPost(props: { title: string }) {
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
    // TODO: support staticPaths in API
    staticPaths: blogPaths,
  } as const;
};
