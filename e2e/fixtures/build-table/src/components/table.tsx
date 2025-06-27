import { use } from 'react';
import type { testData } from '../lib/test-data.js';

export function Table({ data }: { data: ReturnType<typeof testData> }) {
  const tdata = use(data);

  return (
    <table>
      <tbody>
        {tdata.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </tbody>
    </table>
  );
}

function Entry(props: {
  entry: { id: string; name: string; asyncData?: () => Promise<string> };
}) {
  return (
    <tr>
      <td>{props.entry.id}</td>
      <td>{props.entry.name}</td>
    </tr>
  );
}
