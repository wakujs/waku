import type { PageProps } from 'waku/router';

export const PostPage = ({ id }: PageProps<'/posts/[id]'>) => <p>{id}</p>;
