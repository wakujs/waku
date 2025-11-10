import { ImageResponse, type ImageResponseOptions } from '@vercel/og';
import { compilePost } from '../../../../components/post-page';
import { getPostPaths } from '../../../../lib/get-file-name';
import { readFileSync } from 'node:fs';

// partially based on
// https://tangled.org/@danabra.mov/overreacted/blob/main/og/generateImage.js

let imageOptions: ImageResponseOptions;

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

  imageOptions ??= {
    fonts: [
      {
        name: 'Alegreya',
        data: readFileSync(
          'node_modules/@fontsource/alegreya/files/alegreya-latin-700-normal.woff',
        ),
      },
    ],
  };

  return new ImageResponse(
    <OgImageBlogPost title={result.frontmatter.title} />,
    {
      ...imageOptions,
      width: 843,
      height: 441,
    },
  );
};

function notFound() {
  return new Response('Not Found', { status: 404 });
}

function OgImageBlogPost({ title }: { title: string }) {
  return (
    <div
      style={{
        fontFamily: 'Alegreya',
        padding: 30,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'black',
        color: 'white',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 40,
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 35,
          }}
        >
          Waku ⛩️
        </span>
      </div>
      <div
        style={{
          fontSize: 50,
          display: 'flex',
          alignItems: 'center',
          flex: 1,
          paddingBottom: 30,
        }}
      >
        {title}
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
