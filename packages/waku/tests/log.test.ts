import { describe, expect, test } from 'vitest';
import { sanitizeLog } from '../src/lib/utils/log.js';

describe('sanitizeLog', () => {
  test('replaces newlines that could forge log lines with spaces', () => {
    expect(sanitizeLog('ok\r\nFAKE level=error injected')).toBe(
      'ok  FAKE level=error injected',
    );
  });

  test('replaces the ESC byte so ANSI sequences become inert text', () => {
    // The ESC becomes a space; the residual "[31m" is plain text and cannot
    // move the cursor or recolor a terminal.
    expect(sanitizeLog('before\x1b[31mred\x1b[0mafter')).toBe(
      'before [31mred [0mafter',
    );
  });

  test('replaces C0 control chars, DEL, tab and newline with spaces', () => {
    expect(sanitizeLog('a\x00b\x07c\x7fd\te\nf')).toBe('a b c d e f');
  });

  test('uses the stack for Error values', () => {
    const err = new Error('boom\r\ninjected');
    const out = sanitizeLog(err);
    expect(out).toContain('boom');
    expect(out).not.toContain('\r');
    expect(out).not.toContain('\n');
  });

  test('falls back to String() for non-error values', () => {
    expect(sanitizeLog(42)).toBe('42');
    expect(sanitizeLog(null)).toBe('null');
  });
});
