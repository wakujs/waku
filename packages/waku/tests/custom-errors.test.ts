import { describe, expect, test } from 'vitest';
import {
  createCustomError,
  navigableRedirect,
} from '../src/lib/utils/custom-errors.js';

const base = 'https://app.example/RSC/R/next.txt';

const redirectTo = (location: string, status = 307) =>
  createCustomError('moved', { status, location });

describe('navigableRedirect', () => {
  test('resolves a location against the request', () => {
    expect(navigableRedirect(redirectTo('/login'), base)).toBe(
      'https://app.example/login',
    );
    expect(navigableRedirect(redirectTo('https://other.example/x'), base)).toBe(
      'https://other.example/x',
    );
  });

  test('refuses a scheme the browser must not navigate to', () => {
    expect(
      navigableRedirect(redirectTo('javascript:alert(document.domain)'), base),
    ).toBeUndefined();
    expect(
      navigableRedirect(redirectTo('data:text/html,<script></script>'), base),
    ).toBeUndefined();
    expect(navigableRedirect(redirectTo('file:///etc/passwd'), base)).toBe(
      undefined,
    );
  });

  test('a status that is not a redirect stays an error', () => {
    expect(navigableRedirect(redirectTo('/login', 410), base)).toBeUndefined();
    expect(
      navigableRedirect(
        createCustomError('nope', { location: '/login' }),
        base,
      ),
    ).toBeUndefined();
  });

  test('nothing to navigate to without a location', () => {
    expect(
      navigableRedirect(createCustomError('boom', { status: 500 }), base),
    ).toBeUndefined();
    expect(navigableRedirect(new Error('plain'), base)).toBeUndefined();
  });
});
