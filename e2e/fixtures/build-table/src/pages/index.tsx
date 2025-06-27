import { Suspense } from 'react';
import { testData } from '../lib/test-data';
import { Table } from '../components/table';

function App() {
  const data = testData();
  return (
    <Suspense>
      <Table data={data} />
    </Suspense>
  );
}

export default App;

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
