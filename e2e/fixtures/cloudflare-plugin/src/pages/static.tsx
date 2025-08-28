import { Counter } from '../components/counter';
import { env } from 'cloudflare:workers';

export default async function HomePage() {
  return (
    <div>
      <h4>Static</h4>
      <Counter />
      <pre data-testid="vars">MY_VAR = {env.MY_VAR}</pre>
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
