import { readFileSync } from 'node:fs';
import { ImageResponse, type ImageResponseOptions } from '@vercel/og';
import { compilePost } from '../../../../components/post-page';
import { getPostPaths } from '../../../../lib/get-file-name';

// partially based on
// https://tangled.org/@danabra.mov/overreacted/blob/main/og/generateImage.js

let fontOptions: ImageResponseOptions;
let backgroundSrc: string;

async function fetchAsDataUri(url: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

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
        name: 'Inter',
        data: readFileSync(
          'node_modules/@fontsource/inter/files/inter-latin-500-normal.woff',
        ),
        weight: 500,
      },
    ],
  };

  backgroundSrc ??= await fetchAsDataUri(
    'https://cdn.candycode.com/waku/background.jpg',
    'image/jpeg',
  );

  let authorAvatarSrc: string | undefined;
  if (result.author?.avatar) {
    authorAvatarSrc = await fetchAsDataUri(result.author.avatar, 'image/png');
  }

  return new ImageResponse(
    <OgImageBlogPost
      title={result.frontmatter.title}
      description={result.frontmatter.description}
      authorName={result.author?.name}
      authorAvatarSrc={authorAvatarSrc}
      backgroundSrc={backgroundSrc}
    />,
    {
      ...fontOptions,
      width: 1200,
      height: 630,
    },
  );
};

function notFound() {
  return new Response('Not Found', { status: 404 });
}

function OgImageBlogPost({
  title,
  description,
  authorName,
  authorAvatarSrc,
  backgroundSrc,
}: {
  title: string;
  description: string | undefined;
  authorName: string | undefined;
  authorAvatarSrc: string | undefined;
  backgroundSrc: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
      }}
    >
      <img
        src={backgroundSrc}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(28, 25, 23, 0.75)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: 'linear-gradient(to bottom, transparent, black)',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          paddingTop: 60,
          paddingBottom: 60,
          paddingLeft: 90,
          paddingRight: 90,
          color: 'white',
          fontFamily: 'Inter',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 15,
          }}
        >
          {authorAvatarSrc && (
            <img
              src={authorAvatarSrc}
              width={36}
              height={36}
              style={{
                borderRadius: '50%',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            />
          )}
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: 'rgba(255, 255, 255, 0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.125em',
            }}
          >
            {authorName && `by ${authorName}`}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            gap: 15,
          }}
        >
          <div
            style={{
              fontSize: 60,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              display: 'flex',
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: 24,
                color: 'rgba(255, 255, 255, 0.6)',
                display: 'flex',
              }}
            >
              {description}
            </div>
          )}
        </div>
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
