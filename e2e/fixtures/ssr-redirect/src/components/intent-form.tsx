'use client';

import { useActionState } from 'react';

export function IntentForm({
  action,
  label,
}: {
  action: () => Promise<string>;
  label: string;
}) {
  const [state, submit] = useActionState(action, '');
  return (
    <form action={submit}>
      <button type="submit">{label}</button>
      <output>{state}</output>
    </form>
  );
}
