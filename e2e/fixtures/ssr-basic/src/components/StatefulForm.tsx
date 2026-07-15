'use client';

import { useActionState } from 'react';

export const StatefulForm = ({
  action,
}: {
  action: (prev: string, formData: FormData) => Promise<string>;
}) => {
  const [state, formAction] = useActionState(action, 'initial');
  return (
    <form action={formAction}>
      <p data-testid="stateful-state">{state}</p>
      <button type="submit" data-testid="stateful-submit">
        Stateful
      </button>
    </form>
  );
};
