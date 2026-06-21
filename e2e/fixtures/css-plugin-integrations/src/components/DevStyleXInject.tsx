export function DevStyleXInject() {
  if (import.meta.env.PROD || typeof document === 'undefined') {
    return null;
  }
  void import('virtual:stylex:css-only');
  return <link rel="stylesheet" href="/virtual:stylex.css" />;
}
