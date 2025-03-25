export default function Part() {
  return <h2>Dynamic Page Part {new Date().toISOString()}</h2>;
}

export const getConfig = () => ({
  render: 'dynamic',
});
