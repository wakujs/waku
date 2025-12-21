import '../styles.css';

import type { ReactNode } from 'react';
import { Analytics } from '../components/analytics';
import { Providers } from '../components/providers';
import { SmartQuotes } from '../components/smart-quotes';

type RootLayoutProps = { children: ReactNode };

export default async function RootLayout({ children }: RootLayoutProps) {
  return (
    <Providers>
      <Meta />
      <div id="__waku">{children}</div>
      <SmartQuotes />
      <Analytics />
    </Providers>
  );
}

const Meta = () => {
  return (
    <>
      <meta property="og:locale" content="en" />
      <meta property="og:site_name" content="Waku" />
      <meta property="og:type" content="website" />
      <meta
        property="og:image"
        content="https://cdn.candycode.com/waku/opengraph.jpg"
      />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content="https://waku.gg" />
      <meta property="twitter:card" content="summary_large_image" />
      <link
        rel="icon"
        type="image/png"
        href="https://cdn.candycode.com/waku/shinto-shrine.png"
      />
      <link
        rel="alternate"
        type="text/plain"
        href="/api/llms-full.txt"
        title="LLM Context"
      />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&display=block"
        precedence="font"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600;1,700;1,800;1,900&display=block"
        precedence="font"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=block"
        precedence="font"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fira+Code&display=block"
        precedence="font"
      />
    </>
  );
};

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
