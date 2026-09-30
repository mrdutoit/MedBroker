import { describe, it, expect } from 'vitest';
import { formatRand } from './formatMoney.js';

describe('formatRand', () => {
  it.each([
    [4000, 'R4,000'], [0, 'R0'], [999, 'R999'], [9999, 'R9,999'], [9999.6, 'R10,000'],
    [10000, 'R10k'], [45000, 'R45k'], [999499, 'R999k'],
    [1000000, 'R1.00m'], [1840000, 'R1.84m'],
    [null, '—'], [undefined, '—'],
  ])('%s -> %s', (v, out) => expect(formatRand(v)).toBe(out));
});
