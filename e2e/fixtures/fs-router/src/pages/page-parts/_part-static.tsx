export default function Part() {
  return <h2>Static Page Part {new Date().toISOString()}</h2>;
}

export const getConfig = () => ({
  render: 'static',
  order: 0,
});
