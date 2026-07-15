let submitted = 'none';

export const getSubmitted = () => submitted;

async function submitStatic(formData: FormData) {
  'use server';
  submitted = String(formData.get('name') || '');
}

export const StaticActionResultPage = () => (
  <p data-testid="static-action-result">{getSubmitted()}</p>
);

export const StaticActionPage = () => (
  <div>
    <h2>Static Action</h2>
    <form action={submitStatic}>
      <input name="name" aria-label="Static Name" />
      <button type="submit" data-testid="static-action-submit">
        Submit Static
      </button>
    </form>
  </div>
);
