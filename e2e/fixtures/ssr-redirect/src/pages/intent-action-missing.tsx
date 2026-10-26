import { requestNotFound } from 'waku/router/server';
import { IntentForm } from '../components/intent-form.js';

export default function IntentMissingAction() {
  return (
    <>
      <h1>Intent Missing Action</h1>
      <IntentForm
        label="Missing action"
        action={async () => {
          'use server';
          requestNotFound();
          return 'missing';
        }}
      />
    </>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
