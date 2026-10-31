import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import {
  isRouteSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/router-protocol.js';
import { getPathSpecKey } from './config.js';

export function getPathSpecCacheId(pathSpec: PathSpec) {
  return `pathSpec/${getPathSpecKey(pathSpec)}`;
}

export function assertNonReservedSlotId(slotId: string) {
  if (
    slotId === 'root' ||
    isRouteSlotId(slotId) ||
    isSliceSlotId(slotId) ||
    /^[A-Z]/.test(slotId)
  ) {
    throw new Error(
      'Element ID cannot be "root", "route:*", "slice:*", or start with a capital letter',
    );
  }
}
