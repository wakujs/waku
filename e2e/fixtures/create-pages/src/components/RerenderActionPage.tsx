import { unstable_rerenderRoute } from 'waku/router/server';

let submittedName = '';

async function submit(formData: FormData) {
  'use server';
  submittedName = String(formData.get('name') || '');
  unstable_rerenderRoute('/rerender-action');
}

export function RerenderActionPage() {
  return (
    <div>
      <h2>Rerender Action</h2>
      <p data-testid="rerender-action-message">
        {submittedName ? `Submitted: ${submittedName}` : 'No submission'}
      </p>
      <form action={submit}>
        <label htmlFor="rerender-action-name">Name</label>
        <input id="rerender-action-name" name="name" required />
        <button type="submit">Submit Rerender</button>
      </form>
    </div>
  );
}
