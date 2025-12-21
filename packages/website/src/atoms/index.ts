import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const menuAtom = atom(false);

export const scrolledAtom = atom(false);

export const destinationAtom = atom('');

export type RoutingPreference = 'file-based' | 'config-based';

const ROUTING_PREFERENCE_KEY = 'waku-routing-preference';

export const routingTabAtom = atomWithStorage<RoutingPreference>(
  ROUTING_PREFERENCE_KEY,
  'file-based',
);
