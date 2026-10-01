import { describe, it, expect } from 'vitest';
import { csvEscape } from './csv.js';

describe('csvEscape', () => {
  it('quotes a plain value unchanged', () => expect(csvEscape('Thabo')).toBe('"Thabo"'));
  it('doubles embedded quotes', () => expect(csvEscape('a"b')).toBe('"a""b"'));
  it.each(['=SUM(A1)', '+1', '-1', '@x', '\tx', '\rx'])('prefixes an apostrophe to %j', (v) => {
    expect(csvEscape(v)).toBe(`"'${v}"`);
  });
  it('does not prefix a value that merely contains =', () => expect(csvEscape('a=b')).toBe('"a=b"'));
});
