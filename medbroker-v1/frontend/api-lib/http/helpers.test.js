// api-lib/http/helpers.test.js
// Security audit F-02 (22 Aug 2026) — toCsv() previously had no test
// coverage at all; the formula-injection fix below is exactly the kind
// of protection that's easy to silently regress on a future edit to
// escapeCell() if nothing keeps re-proving it on every run.
import { describe, it, expect } from 'vitest';
import { toCsv } from './helpers.js';

const COLUMNS = [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }];

describe('toCsv — formula/CSV injection (F-02)', () => {
  it('prefixes a leading = with an apostrophe', () => {
    const csv = toCsv([{ name: '=HYPERLINK("http://evil.com","click")', note: '' }], COLUMNS);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine.startsWith('=')).toBe(false);
    expect(dataLine).toContain("'=HYPERLINK");
  });

  it('prefixes a leading + with an apostrophe, no wrapping needed without a comma/quote', () => {
    const csv = toCsv([{ name: '+1+1', note: 'x' }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe("'+1+1,x");
  });

  it('prefixes a leading - with an apostrophe', () => {
    const csv = toCsv([{ name: '-2+3', note: 'x' }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe("'-2+3,x");
  });

  it('prefixes a leading @ with an apostrophe', () => {
    const csv = toCsv([{ name: '@SUM(A1:A2)', note: 'x' }], COLUMNS);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine.startsWith('@')).toBe(false);
    expect(dataLine).toContain("'@SUM");
  });

  it('combines the formula guard with comma/quote escaping correctly', () => {
    const csv = toCsv([{ name: '=A1,"B1"', note: 'x' }], COLUMNS);
    const dataLine = csv.split('\r\n')[1];
    // Must be quote-wrapped (contains a comma and quotes), must start
    // the quoted content with an escaped leading apostrophe, and must
    // never start the raw cell with an unescaped '='.
    expect(dataLine.startsWith('"\'=')).toBe(true);
    expect(dataLine).not.toMatch(/^=/);
  });

  it('leaves an ordinary value completely untouched', () => {
    const csv = toCsv([{ name: 'Thabo Mokoena', note: 'Referred by a friend' }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe('Thabo Mokoena,Referred by a friend');
  });

  it('still quotes a value containing a comma with no leading formula character', () => {
    const csv = toCsv([{ name: 'Smith, John', note: '' }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe('"Smith, John",');
  });

  it('still doubles internal quotes with no leading formula character', () => {
    const csv = toCsv([{ name: 'Say "hello"', note: '' }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe('"Say ""hello""",');
  });

  it('handles null/undefined cells as empty strings, not "null"/"undefined"', () => {
    const csv = toCsv([{ name: null, note: undefined }], COLUMNS);
    expect(csv.split('\r\n')[1]).toBe(',');
  });
});
