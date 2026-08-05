import { describe, expect, test } from 'vitest';
import { resolveRedirectLocation } from '../src/lib/utils/redirect.js';

const request = 'https://app.example/RSC/R/next.txt';

const resolve = (location: string, basePath = '/') =>
  resolveRedirectLocation(location, request, basePath);

describe('resolveRedirectLocation', () => {
  test('an app path keeps its base applied once', () => {
    expect(resolve('/login')).toBe('/login');
    expect(resolve('/login', '/base/')).toBe('/base/login');
  });

  test('a same host absolute location gives up its origin', () => {
    // the browser resolves it against the page, so an https app behind a proxy
    // is not sent back to the http the socket reports
    expect(resolve('https://app.example/login')).toBe('/login');
    expect(resolve('http://app.example/login?a=1#x')).toBe('/login?a=1#x');
  });

  test('a same host absolute location is already based', () => {
    expect(resolve('https://app.example/base/login', '/base/')).toBe(
      '/base/login',
    );
  });

  test('another host keeps the scheme it named', () => {
    expect(resolve('https://other.example/x')).toBe('https://other.example/x');
  });

  test('another host that named no scheme stays without one', () => {
    expect(resolve('//other.example/x')).toBe('//other.example/x');
    // a backslash is a slash to the url parser, and the browser follows it
    expect(resolve('/\\other.example/x')).toBe('//other.example/x');
  });

  test('a control character never survives into the location', () => {
    // it would be rejected as a header value and take down the response
    expect(resolve('/x\r\nSet-Cookie: a=b')).toBe('/xSet-Cookie:%20a=b');
  });

  test('refuses a scheme the browser must not navigate to', () => {
    expect(resolve('javascript:alert(document.domain)')).toBeUndefined();
    expect(resolve('data:text/html,<script></script>')).toBeUndefined();
    expect(resolve('file:///etc/passwd')).toBeUndefined();
  });

  test('a location that is not a url at all', () => {
    expect(resolve('https://[')).toBeUndefined();
  });
});
