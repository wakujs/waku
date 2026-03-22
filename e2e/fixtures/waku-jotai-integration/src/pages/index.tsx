import { atom } from 'jotai/vanilla';
import { getStore } from 'waku-jotai/router';
import { Counter, countAtom } from '../components/counter.js';

// server-only atom
const doubleCountAtom = atom(async (get) => {
  await new Promise((r) => setTimeout(r, 100));
  return get(countAtom) * 2;
});

export default async function HomePage() {
  const store = await getStore();
  const doubleCount = store.get(doubleCountAtom);
  return (
    <div>
      <Counter />
      <h2 data-testid="double-count">[doubleCount={doubleCount}]</h2>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
