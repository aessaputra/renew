import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as wallos from '../src/lib/wallos.ts';

it('formats subscription prices without losing fractional values or guessing currencies', () => {
  assert.equal(typeof wallos.formatPrice, 'function');
  const format = wallos.formatPrice;
  for (const [amount, currency, expected] of [
    [36000, 'IDR', 'Rp\u00a036.000'],
    [36000.125, 'idr', 'Rp\u00a036.000,125'],
    [1234.56, 'USD', '$1,234.56'],
    [1234.56, 'EUR', '€1,234.56'],
    [1234.5, 'JPY', '¥1,234.5'],
    [1.2345, 'KWD', 'KWD\u00a01.2345'],
    [0.0000001, 'USD', '$0.0000001'],
    [0, 'IDR', 'Rp\u00a00'],
    [1234.5, '', '1,234.5'],
    [1234.5, 'not-currency', 'not-currency\u00a01,234.5'],
    [1234.5, 'ZZZ', 'ZZZ\u00a01,234.5']
  ] as const) assert.equal(format(amount, currency), expected);
});
