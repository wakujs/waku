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
    expect(navigableRedirect(redirectTo('/login'), base)?.href).toBe(
      'https://app.example/login',
    );
    expect(
      navigableRedirect(redirectTo('https://other.example/x'), base)?.href,
    ).toBe('https://other.example/x');
  });

  test('a same origin target keeps its path for the caller to base', () => {
    // the handler applies the base path, so the url must not be absolutised
    const target = navigableRedirect(redirectTo('/login'), base);
    expect(target?.origin).toBe('https://app.example');
    expect(target?.pathname).toBe('/login');
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

  test('a location is the redirect, whatever the status says', () => {
    // the client follows a location without reading the status, so a throw
    // before the render must not decide it differently
    expect(navigableRedirect(redirectTo('/login', 410), base)?.pathname).toBe(
      '/login',
    );
    expect(
      navigableRedirect(createCustomError('nope', { location: '/login' }), base)
        ?.pathname,
    ).toBe('/login');
  });

  test('a location that is not a url at all', () => {
    expect(navigableRedirect(redirectTo('https://['), base)).toBeUndefined();
  });

  test('nothing to navigate to without a location', () => {
    expect(
      navigableRedirect(createCustomError('boom', { status: 500 }), base),
    ).toBeUndefined();
    expect(navigableRedirect(new Error('plain'), base)).toBeUndefined();
  });
});
