import { requestRefresh } from 'waku/router/server';
import { OptimisticActionForm } from './optimistic-action-form.js';

let submittedName = '';

async function submit(formData: FormData) {
  'use server';
  submittedName = String(formData.get('name') || '');
  requestRefresh();
}

export function OptimisticActionPage() {
  return (
    <div>
      <h2>Optimistic Action</h2>
      <OptimisticActionForm submittedName={submittedName} submit={submit} />
    </div>
  );
}
