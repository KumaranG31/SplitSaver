import type { OrderItem } from '@/store/useParsedDataStore';
import {
  computeBestPlatform,
  hasEstimatedPrices,
  PLATFORM_FEES,
  resolvePrice,
  subtotalFor,
  summarizeItems,
  type Coupon,
} from '@/utils/optimizationEngine';

/**
 * Test item builder.
 *
 * price is shorthand for the same price on every platform, which is what most
 * cases want when the thing under test is coupon or fee behaviour. Pass
 * prices explicitly to vary a price per platform.
 */
const item = (
  over: Partial<OrderItem> & { id: string; price?: number },
): OrderItem => {
  const { price, ...rest } = over;
  return {
    name: 'Item',
    quantity: 1,
    ...rest,
    prices: rest.prices ?? {
      Swiggy: price ?? 0,
      Zomato: price ?? 0,
      Toing: price ?? 0,
    },
  };
};

const basket: OrderItem[] = [
  item({ id: '1', name: 'Burger', price: 100, quantity: 2 }),
  item({ id: '2', name: 'Fries', price: 50, quantity: 1 }),
];

const coupons: Coupon[] = [
  { code: 'SWIGGY10', discount: 10, platform: 'Swiggy' },
  { code: 'ZOMATO15', discount: 15, platform: 'Zomato' },
  { code: 'TOING2', discount: 2, platform: 'Toing' },
];

describe('summarizeItems', () => {
  it('multiplies fee and tax by quantity', () => {
    const totals = summarizeItems([
      item({ id: '1', price: 100, quantity: 2, platformFee: 3, tax: 5 }),
      item({ id: '2', price: 50, quantity: 1 }),
    ]);

    expect(totals).toEqual({ itemFees: 6, tax: 10 });
  });

  it('treats missing fee and tax as zero', () => {
    expect(summarizeItems(basket)).toEqual({ itemFees: 0, tax: 0 });
  });

  it('reports no subtotal, because a subtotal needs a platform to mean anything', () => {
    expect(summarizeItems(basket)).not.toHaveProperty('subtotal');
  });
});

describe('computeBestPlatform', () => {
  it('prices the same basket differently per platform and sorts cheapest first', () => {
    const results = computeBestPlatform(basket, coupons);

    // Basket subtotal is 250 on every platform.
    //   Zomato  250 + 25 - 15 = 260
    //   Toing   250 + 20 -  2 = 268
    //   Swiggy  250 + 30 - 10 = 270
    expect(results.map((r) => [r.platform, r.total])).toEqual([
      ['Zomato', 260],
      ['Toing', 268],
      ['Swiggy', 270],
    ]);
  });

  it('reports the breakdown that produced each total', () => {
    const swiggy = computeBestPlatform(basket, coupons).find((r) => r.platform === 'Swiggy');

    expect(swiggy).toEqual({
      platform: 'Swiggy',
      subtotal: 250,
      itemFees: 0,
      tax: 0,
      deliveryFee: 30,
      discount: 10,
      coupon: 'SWIGGY10',
      // The fixture gives every platform the same price, so nothing is borrowed.
      estimated: false,
      total: 270,
    });
  });

  it('includes per-item fees and tax captured during verification', () => {
    const results = computeBestPlatform([
      item({ id: '1', price: 200, quantity: 1, platformFee: 20, tax: 18 }),
    ]);

    expect(results.find((r) => r.platform === 'Toing')).toMatchObject({
      subtotal: 200,
      itemFees: 20,
      tax: 18,
      deliveryFee: 20,
      total: 258,
    });
  });

  it('picks the largest eligible coupon for a platform', () => {
    const results = computeBestPlatform(basket, [
      { code: 'TEN', discount: 10, platform: 'Swiggy' },
      { code: 'TWENTY', discount: 20, platform: 'Swiggy' },
      { code: 'FIVE', discount: 5, platform: 'Swiggy' },
    ]);

    expect(results.find((r) => r.platform === 'Swiggy')).toMatchObject({
      coupon: 'TWENTY',
      discount: 20,
    });
  });

  it('skips coupons whose minimum order value is not met', () => {
    const results = computeBestPlatform(basket, [
      { code: 'BIG', discount: 100, platform: 'Swiggy', minOrder: 1000 },
    ]);

    expect(results.find((r) => r.platform === 'Swiggy')).toMatchObject({
      coupon: null,
      discount: 0,
      total: 250 + PLATFORM_FEES.Swiggy,
    });
  });

  it('tests minOrder against the item subtotal, not the delivered total', () => {
    // A Rs 370 basket costs Rs 400 once the Rs 30 delivery fee is added, but the
    // order did not meet a Rs 400 minimum, so the gated coupon must not apply.
    const small = computeBestPlatform([item({ id: '1', price: 370, quantity: 1 })], [
      { code: 'GATED', discount: 50, platform: 'Swiggy', minOrder: 400 },
    ]);
    expect(small.find((r) => r.platform === 'Swiggy')).toMatchObject({ coupon: null });

    // Rs 400 of items does meet it.
    const large = computeBestPlatform([item({ id: '1', price: 400, quantity: 1 })], [
      { code: 'GATED', discount: 50, platform: 'Swiggy', minOrder: 400 },
    ]);
    expect(large.find((r) => r.platform === 'Swiggy')).toMatchObject({ coupon: 'GATED' });
  });

  it('excludes tax and platform fees from the minOrder test too', () => {
    const results = computeBestPlatform(
      [item({ id: '1', price: 380, quantity: 1, platformFee: 15, tax: 40 })],
      [{ code: 'GATED', discount: 50, platform: 'Swiggy', minOrder: 400 }],
    );

    // Items Rs 380 + fees Rs 15 + tax Rs 40 = Rs 435, but only Rs 380 counts.
    expect(results.find((r) => r.platform === 'Swiggy')).toMatchObject({ coupon: null });
  });

  it('resolves equal-value coupons the same way regardless of input order', () => {
    const a = { code: 'ALPHA', discount: 40, platform: 'Swiggy' as const };
    const b = { code: 'BRAVO', discount: 40, platform: 'Swiggy' as const };
    const items = [item({ id: '1', price: 300, quantity: 1 })];

    const forward = computeBestPlatform(items, [a, b]);
    const reversed = computeBestPlatform(items, [b, a]);

    expect(forward[0].coupon).toBe('ALPHA');
    expect(reversed[0].coupon).toBe('ALPHA');
  });

  it('breaks a tie in favour of the coupon with no minimum order', () => {
    const results = computeBestPlatform([item({ id: '1', price: 300, quantity: 1 })], [
      { code: 'ZZZ_UNRESTRICTED', discount: 40, platform: 'Swiggy' },
      { code: 'AAA_RESTRICTED', discount: 40, platform: 'Swiggy', minOrder: 100 },
    ]);

    // Equal value, so the unrestricted coupon wins despite sorting later by code.
    expect(results[0].coupon).toBe('ZZZ_UNRESTRICTED');
  });

  it('caps a percentage-style coupon at maxDiscount', () => {
    const results = computeBestPlatform(basket, [
      { code: 'PCT', discount: 500, platform: 'Zomato', maxDiscount: 40 },
    ]);

    expect(results.find((r) => r.platform === 'Zomato')).toMatchObject({
      coupon: 'PCT',
      discount: 40,
    });
  });

  it('ignores a maxDiscount that sits above the discount, since it cannot bind', () => {
    const capped = computeBestPlatform(basket, [
      { code: 'LOOSE', discount: 50, platform: 'Swiggy', maxDiscount: 120 },
    ]);
    const plain = computeBestPlatform(basket, [
      { code: 'PLAIN', discount: 50, platform: 'Swiggy' },
    ]);

    expect(capped.find((r) => r.platform === 'Swiggy')?.discount).toBe(50);
    expect(capped.find((r) => r.platform === 'Swiggy')?.total).toBe(
      plain.find((r) => r.platform === 'Swiggy')?.total,
    );
  });

  it('never returns a negative total', () => {
    const results = computeBestPlatform([item({ id: '1', price: 10, quantity: 1 })], [
      { code: 'HUGE', discount: 10_000, platform: 'Swiggy' },
    ]);
    const swiggy = results.find((r) => r.platform === 'Swiggy');

    // Discount is capped at what the order is actually worth: 10 + 30 delivery.
    expect(swiggy).toMatchObject({ discount: 40, total: 0 });
    expect(results.every((r) => r.total >= 0)).toBe(true);
  });

  it('handles an empty basket without coupons', () => {
    const results = computeBestPlatform([]);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.total === PLATFORM_FEES[r.platform])).toBe(true);
  });
});

describe('resolvePrice', () => {
  it('prefers the price captured from that platform', () => {
    const burger = item({ id: '1', prices: { Swiggy: 100, Zomato: 120 } });

    expect(resolvePrice(burger, 'Zomato')).toEqual({ price: 120, estimated: false });
  });

  it('borrows a price from another platform and admits it is a guess', () => {
    const burger = item({ id: '1', prices: { Swiggy: 100 } });

    expect(resolvePrice(burger, 'Toing')).toEqual({ price: 100, estimated: true });
  });

  it('treats a price of zero as measured, not missing', () => {
    const free = item({ id: '1', prices: { Swiggy: 0, Zomato: 100 } });

    // Zero is a real price, so it must not trigger a borrow from Zomato.
    expect(resolvePrice(free, 'Swiggy')).toEqual({ price: 0, estimated: false });
  });

  it('costs nothing but stays flagged as an estimate when no price is known', () => {
    expect(resolvePrice(item({ id: '1', prices: {} }), 'Swiggy')).toEqual({
      price: 0,
      estimated: true,
    });
  });

  it('borrows deterministically, so the same item never changes between renders', () => {
    const mixed = item({ id: '1', prices: { Toing: 90, Swiggy: 100 } });
    const once = resolvePrice(mixed, 'Zomato');
    const twice = resolvePrice(mixed, 'Zomato');

    expect(once).toEqual(twice);
  });
});

describe('subtotalFor', () => {
  it('costs the same basket differently on each platform', () => {
    const basket = [item({ id: '1', prices: { Swiggy: 100, Zomato: 120, Toing: 90 } })];

    expect(subtotalFor(basket, 'Swiggy')).toBe(100);
    expect(subtotalFor(basket, 'Zomato')).toBe(120);
    expect(subtotalFor(basket, 'Toing')).toBe(90);
  });

  it('multiplies by quantity', () => {
    const basket = [item({ id: '1', prices: { Swiggy: 100 }, quantity: 3 })];

    expect(subtotalFor(basket, 'Swiggy')).toBe(300);
  });

  it('still costs a platform that was never screenshotted, by borrowing', () => {
    const basket = [item({ id: '1', prices: { Swiggy: 100 } })];

    expect(subtotalFor(basket, 'Toing')).toBe(100);
  });
});

describe('hasEstimatedPrices', () => {
  it('is false when every platform priced every item', () => {
    const basket = [item({ id: '1', price: 100 })];

    expect(hasEstimatedPrices(basket, 'Swiggy')).toBe(false);
  });

  it('is true when the platform had to borrow any price', () => {
    const basket = [item({ id: '1', prices: { Swiggy: 100 } })];

    expect(hasEstimatedPrices(basket, 'Swiggy')).toBe(false);
    expect(hasEstimatedPrices(basket, 'Zomato')).toBe(true);
  });

  it('is true when one item out of many was borrowed', () => {
    const basket = [
      item({ id: '1', prices: { Swiggy: 100, Zomato: 100 } }),
      item({ id: '2', prices: { Swiggy: 50 } }),
    ];

    expect(hasEstimatedPrices(basket, 'Zomato')).toBe(true);
  });
});

describe('a basket priced from three different app screenshots', () => {
  const threeApps = [
    item({ id: 'paneer', name: 'Paneer Tikka', prices: { Swiggy: 250, Zomato: 280 }, quantity: 2 }),
    item({ id: 'dosa', name: 'Masala Dosa', prices: { Toing: 180 }, quantity: 1 }),
  ];

  it('costs each platform with its own prices where they exist', () => {
    // Swiggy and Zomato know Paneer Tikka but not the dosa; only Toing does.
    expect(subtotalFor(threeApps, 'Swiggy')).toBe(250 * 2 + 180);
    expect(subtotalFor(threeApps, 'Zomato')).toBe(280 * 2 + 180);
    expect(subtotalFor(threeApps, 'Toing')).toBe(250 * 2 + 180);
  });

  it('flags every platform as an estimate, because no screenshot had everything', () => {
    expect(hasEstimatedPrices(threeApps, 'Swiggy')).toBe(true);
    expect(hasEstimatedPrices(threeApps, 'Zomato')).toBe(true);
    expect(hasEstimatedPrices(threeApps, 'Toing')).toBe(true);
  });

  it('passes the estimate flag through to every quote', () => {
    const results = computeBestPlatform(threeApps, coupons);

    expect(results.every((r) => r.estimated)).toBe(true);
  });

  it('does not flag an estimate when the borrowed price happens to match', () => {
    // Same dosa price on all three apps, so nothing is actually a guess.
    const consistent = [
      item({ id: 'paneer', prices: { Swiggy: 250, Zomato: 250, Toing: 250 }, quantity: 2 }),
      item({ id: 'dosa', prices: { Swiggy: 180, Zomato: 180, Toing: 180 }, quantity: 1 }),
    ];

    expect(hasEstimatedPrices(consistent, 'Swiggy')).toBe(false);
    expect(computeBestPlatform(consistent, coupons).every((r) => !r.estimated)).toBe(true);
  });
});
