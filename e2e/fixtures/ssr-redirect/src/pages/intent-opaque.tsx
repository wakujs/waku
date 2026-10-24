import { OpaqueAction } from '../components/opaque-result';

export default function IntentOpaque() {
  return (
    <div>
      <h1>Opaque references</h1>
      <OpaqueAction />
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
