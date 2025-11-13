type MetaProps = {
  title: string;
  description: string;
  ogImageUrl?: string | undefined;
};

export const Meta = ({ title, description, ogImageUrl }: MetaProps) => {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta
        property="og:image"
        content={ogImageUrl ?? 'https://cdn.candycode.com/waku/opengraph.jpg'}
      />

      <link
        rel="alternate"
        type="application/rss+xml"
        title="rss"
        href="https://waku.gg/api/rss.xml"
      />
    </>
  );
};

export function getMetadataBaseUrl() {
  // https://vercel.com/docs/environment-variables/system-environment-variables#VERCEL_URL
  // https://github.com/vercel/next.js/blob/498349c375e2602f526f64e8366992066cfa872c/packages/next/src/lib/metadata/resolvers/resolve-url.ts#L10-L55
  if (process.env.VERCEL_URL) {
    const origin =
      process.env.VERCEL_ENV === 'preview'
        ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
        : process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return `https://${origin}`;
  }
  return process.env.METADATA_BASE_URL ?? 'http://localhost:8080';
}
