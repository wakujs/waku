import type { PathSpec } from '../isomorphic-utils/path-spec.js';
import {
  isRouteSlotId,
  isSliceSlotId,
} from '../isomorphic-utils/router-protocol.js';
import { getPathSpecKey } from './config.js';

export const getPathSpecCacheId = (pathSpec: PathSpec) =>
  `pathSpec/${getPathSpecKey(pathSpec)}`;

export const assertNonReservedSlotId = (slotId: string) => {
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
};
