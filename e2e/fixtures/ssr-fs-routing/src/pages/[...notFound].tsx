export default function NotFoundPage({ notFound }: { notFound: string[] }) {
  return (
    <div>
      <h1>Not Found</h1>
      <p>The page {notFound.join('/')} was not found.</p>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
