import { StatefulForm } from './StatefulForm.js';

let echo = 'none';

export const getEcho = () => echo;

export const receivePlainPost = (formData: FormData) => {
  echo = `custom:${String(formData.get('plain-field') || '')}`;
};

async function submitAction(formData: FormData) {
  'use server';
  echo = `action:${String(formData.get('name') || '')}`;
}

async function submitBoundAction(label: string, _formData: FormData) {
  'use server';
  echo = `action:${label}`;
}

async function submitStateful(prev: string, _formData: FormData) {
  'use server';
  echo = 'action:stateful';
  return `updated:${prev}`;
}

export const MixedForms = () => (
  <html>
    <head>
      <title>Mixed Forms</title>
    </head>
    <body>
      <h2>Mixed Forms</h2>
      <p data-testid="echo">{getEcho()}</p>
      <form action={submitAction}>
        <input name="name" aria-label="Name" />
        <button type="submit" data-testid="action-submit">
          Action
        </button>
      </form>
      <form action={submitBoundAction.bind(null, 'bound')}>
        <button type="submit" data-testid="bound-submit">
          Bound
        </button>
      </form>
      <StatefulForm action={submitStateful} />
      <form method="post" encType="multipart/form-data">
        <input name="plain-field" defaultValue="plain-value" />
        <button type="submit" data-testid="plain-submit">
          Plain
        </button>
      </form>
    </body>
  </html>
);
