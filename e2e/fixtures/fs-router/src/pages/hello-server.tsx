import { HelloClient } from '../components/hello-client.js';

export default async function HelloServer() {
  return <HelloClient />;
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
