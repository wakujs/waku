import { Link } from 'waku';

type GuideItemProps = {
  slug: string;
  title: string;
  description: string;
};

const GuideItem = ({ guide }: { guide: GuideItemProps }) => (
  <li>
    <Link
      to={`/guides/${guide.slug}`}
      className="bg-gray-950/90 group flex h-full flex-col rounded-xl border border-gray-800 p-4 transition-colors duration-300 ease-in-out hover:border-secondary sm:p-6"
    >
      <h3 className="font-headline text-xl leading-tight sm:text-2xl">
        {guide.title}
      </h3>
      <p className="mt-2 text-sm font-normal leading-snug text-white/60">
        {guide.description}
      </p>
    </Link>
  </li>
);

export const GuideList = ({ guides }: { guides: GuideItemProps[] }) => (
  <ul className="-mx-4 grid grid-cols-1 gap-6 sm:-mx-6 lg:-mx-12 lg:grid-cols-2 lg:gap-8">
    {guides.map((guide) => (
      <GuideItem key={guide.slug} guide={guide} />
    ))}
  </ul>
);
