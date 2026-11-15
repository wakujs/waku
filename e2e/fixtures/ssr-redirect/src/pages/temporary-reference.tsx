import { requestRefresh } from 'waku/router/server';
import { TemporaryReferenceProbe } from '../components/temporary-reference-probe';

let received: unknown;

async function roundTrip(value: unknown) {
  'use server';
  received = value;
  requestRefresh();
}

export default function TemporaryReferencePage() {
  return <TemporaryReferenceProbe value={received} roundTrip={roundTrip} />;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
