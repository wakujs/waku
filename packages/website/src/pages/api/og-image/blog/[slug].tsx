import { readFileSync } from 'node:fs';
import { ImageResponse, type ImageResponseOptions } from '@vercel/og';
import { compilePost } from '../../../../components/post-page';
import { getPostPaths } from '../../../../lib/get-file-name';

// partially based on
// https://tangled.org/@danabra.mov/overreacted/blob/main/og/generateImage.js

let fontOptions: ImageResponseOptions;

export const GET = async (request: Request) => {
  const url = new URL(request.url);
  const filename = url.pathname.split('/').pop()!;
  if (!filename.endsWith('.png')) {
    return notFound();
  }
  const slug = filename.slice(0, -4);

  const result = await compilePost({ folder: './private/contents', slug });
  if (!result) {
    return notFound();
  }

  fontOptions ??= {
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
      ...fontOptions,
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
            fontSize: 40,
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
    staticPaths: blogPaths.map((p) => `${p}.png`),
  } as const;
};
