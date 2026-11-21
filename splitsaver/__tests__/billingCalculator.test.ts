import { splitEqually } from '@/utils/billingCalculator';

describe('splitEqually', () => {
  test('splits evenly when total divides cleanly', () => {
    expect(splitEqually(100, 4)).toEqual([25, 25, 25, 25]);
  });

  test('handles rounding cents correctly', () => {
    // 100.01 rupees = 10001 cents, 3 people => 3333, 3333, 3335 cents
    expect(splitEqually(100.01, 3)).toEqual([33.33, 33.33, 33.35]);
  });

  test('zero or negative people returns empty array', () => {
    expect(splitEqually(50, 0)).toEqual([]);
    expect(splitEqually(50, -2)).toEqual([]);
  });

  test('always sums back to the original total', () => {
    for (const [total, people] of [
      [100.01, 3],
      [0.07, 4],
      [999.99, 7],
      [10, 3],
      [1234.56, 11],
    ] as const) {
      const shares = splitEqually(total, people);
      const sum = shares.reduce((acc, share) => acc + share, 0);
      expect(sum.toFixed(2)).toBe(total.toFixed(2));
    }
  });

  test('returns one entry per person', () => {
    expect(splitEqually(50, 6)).toHaveLength(6);
  });

  test('handles a zero total', () => {
    expect(splitEqually(0, 3)).toEqual([0, 0, 0]);
  });

  test('absords the remainder into the last share rather than losing it', () => {
    const shares = splitEqually(10, 3);
    expect(shares[0]).toBe(3.33);
    expect(shares[2]).toBe(3.34);
  });
});
