import { requestRedirect } from 'waku/router/server';
import { IntentForm } from '../components/intent-form.js';

export default function IntentAction() {
  return (
    <>
      <h1>Intent Action</h1>
      <IntentForm
        label="Intent redirect action"
        action={async () => {
          'use server';
          requestRedirect('/destination');
          return 'saved';
        }}
      />
    </>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
