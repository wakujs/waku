import { describe, expect, test, vi } from 'vitest';
import { getRequest } from '../src/router/define-router-utils/request-store.js';
import * as server from '../src/router/server.js';

vi.mock('../src/server.js', () => ({}));

describe('waku/router/server surface', () => {
  test('exposes getRequest without the removed request accessors', () => {
    expect(server.getRequest).toBe(getRequest);
    expect(server).not.toHaveProperty('unstable_getRequest');
    expect(server).not.toHaveProperty('unstable_getHeaders');
  });
});
