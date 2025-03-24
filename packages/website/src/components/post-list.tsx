import { Link } from 'waku';

type PostListItemProps = {
  slug: string;
  title: string;
  description: string;
  author?: {
    name: string;
  };
  date?: string;
  rawDate?: string;
  release?: string | undefined;
};

const PostListItem = ({
  postItem,
  path,
}: {
  postItem: PostListItemProps;
  path: 'blog' | 'guides';
}) => (
  <li
    key={postItem.slug}
    className="-mx-px first:-mt-4 sm:first:-mt-6 lg:first:-mt-12"
  >
    <Link
      to={`/${path}/${postItem.slug}`}
      className="bg-gray-950/90 group block w-full rounded-xl border border-gray-800 p-2 transition-colors duration-300 ease-in-out hover:border-secondary sm:p-4 lg:p-6"
    >
      <div className="flex items-center gap-2 whitespace-nowrap sm:gap-4">
        {postItem.release && (
          <div>
            <div className="inline-block rounded-md bg-white px-2 py-1 text-[0.625rem] font-black tracking-wide text-black sm:text-xs">
              <span className="hidden uppercase sm:inline">Waku</span>{' '}
              {postItem.release}
            </div>
          </div>
        )}
        {(!!postItem.date || !!postItem.author) && (
          <div className="inline-flex items-center gap-1 font-simple text-[11px] uppercase tracking-[0.125em] text-gray-400 sm:gap-4">
            {!!postItem.date && <span>{postItem.date}</span>}
            {!!postItem.date && !!postItem.author && (
              <span className="text-gray-600">/</span>
            )}
            {!!postItem.author && <span>{postItem.author.name}</span>}
          </div>
        )}
      </div>
      <h3 className="mt-6 font-serif text-2xl font-extrabold leading-none sm:text-4xl">
        {postItem.title}
      </h3>
      <div className="mt-2 text-sm font-normal leading-snug text-white/60 sm:mt-1 sm:text-base">
        {postItem.description}
      </div>
    </Link>
  </li>
);

export const PostList = ({
  posts,
  path,
}: {
  posts: PostListItemProps[];
  path: 'blog' | 'guides';
}) => (
  <ul className="-mx-4 -mt-px flex flex-col gap-6 sm:-mx-6 md:-mx-12 lg:gap-12">
    {posts.map((post) => (
      <PostListItem key={post.slug} postItem={post} path={path} />
    ))}
  </ul>
);
