import { SkipNavToBButton } from '../../components/skip-nav.js';

export default function SkipPageA() {
  return (
    <div>
      <h1>SKIP_A_PAGE_MARKER</h1>
      <SkipNavToBButton />
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
