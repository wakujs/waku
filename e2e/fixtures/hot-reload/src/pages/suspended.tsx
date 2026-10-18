import { PendingPage } from '../components/pending-navigation.js';

export default function SuspendedPage() {
  return (
    <>
      <h1>Suspended destination</h1>
      <PendingPage />
    </>
  );
}

export const getConfig = async () => ({ render: 'dynamic' }) as const;
