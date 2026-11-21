import { groupItemsByPlatform, pickBasket } from '@/utils/baskets';
import {
  applyPlatformAssignment,
  assignPlatform,
  buildScreenshotGuesses,
  mergeLines,
  toStoreData,
} from '@/utils/screenshotModel';
import { hasEstimatedPrices } from '@/utils/optimizationEngine';
import type { OrderItem } from '@/store/useParsedDataStore';
import type { OCRFileResult } from '@/hooks/useOCR';

const shot = (fileName: string, text: string): OCRFileResult => ({
  file: { name: fileName } as File,
  fileName,
  text,
});

const makeItem = (
  id: string,
  sourcePlatform?: OrderItem['sourcePlatform'],
): OrderItem => ({
  id,
  name: `Item ${id}`,
  prices: sourcePlatform === undefined ? {} : { [sourcePlatform]: 100 },
  quantity: 1,
  sourcePlatform,
});

describe('groupItemsByPlatform', () => {
  it('builds one basket per app in a stable order', () => {
    const { baskets } = groupItemsByPlatform([
      makeItem('a', 'Zomato'),
      makeItem('b', 'Swiggy'),
      makeItem('c', 'Swiggy'),
    ]);

    expect(baskets.map((basket) => basket.platform)).toEqual(['Swiggy', 'Zomato']);
    expect(baskets[0].items).toHaveLength(2);
  });

  it('holds unattributed items aside instead of guessing', () => {
    const { baskets, unattributed } = groupItemsByPlatform([
      makeItem('a', 'Swiggy'),
      makeItem('b'),
    ]);

    expect(baskets).toHaveLength(1);
    expect(unattributed.map((entry) => entry.id)).toEqual(['b']);
  });
});

describe('pickBasket', () => {
  const baskets = [
    { platform: 'Swiggy' as const, items: [makeItem('a'), makeItem('b')] },
    { platform: 'Zomato' as const, items: [makeItem('c')] },
  ];

  it('honours a confirmed selection', () => {
    expect(pickBasket(baskets, 'Zomato')?.platform).toBe('Zomato');
  });

  it('falls back to the only basket when the selection is not represented', () => {
    const single = [{ platform: 'Swiggy' as const, items: [makeItem('a')] }];
    expect(pickBasket(single, 'Toing')?.platform).toBe('Swiggy');
  });

  it('falls back to the largest basket when the choice is ambiguous', () => {
    expect(pickBasket(baskets, null)?.platform).toBe('Swiggy');
    expect(pickBasket(baskets, 'Toing')?.platform).toBe('Swiggy');
  });

  it('returns null when nothing has a platform', () => {
    expect(pickBasket([], null)).toBeNull();
  });
});

describe('buildScreenshotGuesses', () => {
  it('detects each screenshot independently', () => {
    const guesses = buildScreenshotGuesses([
      shot('swiggy-order.png', 'Swiggy\nItem total 680\nGST 36'),
      shot('zomato-coupon.png', 'Zomato offer\nCoupon ZOMATO75\n50% off up to 120'),
    ]);

    expect(guesses.map((guess) => guess.platform)).toEqual(['Swiggy', 'Zomato']);
    expect(guesses.map((guess) => guess.kind)).toEqual(['order', 'coupon']);
  });

  it('leaves an unrecognisable screenshot unattributed', () => {
    const guesses = buildScreenshotGuesses([shot('mystery.png', 'Paneer Tikka 250')]);

    expect(guesses[0].platform).toBeNull();
    expect(guesses[0].kind).toBe('unknown');
  });
});

describe('assignPlatform', () => {
  it('overrides one guess and marks it confirmed', () => {
    const guesses = buildScreenshotGuesses([
      shot('a.png', 'Swiggy\nItem total 680'),
      shot('b.png', 'Zomato\nItem total 500'),
    ]);

    const next = assignPlatform(guesses, 'a.png', 'Zomato');

    expect(next[0]).toMatchObject({ platform: 'Zomato', confirmed: true });
    expect(next[1]).toMatchObject({ platform: 'Zomato', confirmed: false });
  });

  it('can send a guess back to unknown', () => {
    const guesses = buildScreenshotGuesses([shot('a.png', 'Swiggy\nItem total 680')]);

    expect(assignPlatform(guesses, 'a.png', null)[0].platform).toBeNull();
  });
});

describe('platform correction on parsed items', () => {
  it('assigns by id when two screenshots share a file name', () => {
    const guesses = buildScreenshotGuesses([
      { ...shot('same.png', 'Swiggy\nPaneer Tikka 250'), id: 'shot-1' },
      { ...shot('same.png', 'Zomato\nPaneer Tikka 280'), id: 'shot-2' },
    ]);

    const next = assignPlatform(guesses, 'shot-2', 'Toing');

    expect(next.map((guess) => guess.platform)).toEqual(['Swiggy', 'Toing']);
  });

  it('keeps an unattributed price when its screenshot is assigned to an app', () => {
    const [item] = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 2, sourceShotId: 'shot-1' },
    ]);

    expect(item).toMatchObject({ sourceShotId: 'shot-1', unattributedPrice: 250 });

    const [corrected] = applyPlatformAssignment([item], 'shot-1', 'Zomato');

    expect(corrected).toMatchObject({ sourcePlatform: 'Zomato', prices: { Zomato: 250 } });
    expect(corrected.unattributedPrice).toBeUndefined();
  });

  it('preserves a manual price when an attributed item changes app', () => {
    const item: OrderItem = {
      id: 'paneer',
      name: 'Paneer Tikka',
      prices: { Swiggy: 300 },
      quantity: 2,
      sourcePlatform: 'Swiggy',
      sourceShotId: 'shot-1',
    };

    const [corrected] = applyPlatformAssignment([item], 'shot-1', 'Toing');

    expect(corrected).toMatchObject({ sourcePlatform: 'Toing', prices: { Toing: 300 } });
  });
});

describe('toStoreData', () => {
  it('tags items with their app and collects coupons from offer screenshots', () => {
    const guesses = buildScreenshotGuesses([
      shot('swiggy-order.png', 'Swiggy\nItem total 680\nPaneer Tikka 250\nMasala Dosa 180'),
      shot('swiggy-coupon.png', 'Swiggy offer\nCoupon SWIGGY50\n50% off up to 120'),
    ]);

    const { items, coupons } = toStoreData(guesses);

    expect(items).toHaveLength(2);
    expect(items.every((entry) => entry.sourcePlatform === 'Swiggy')).toBe(true);
    // A price read off a Swiggy bill is only a Swiggy price until someone
    // confirms the same item costs the same elsewhere.
    expect(items[0].prices).toEqual({ Swiggy: 250 });
    expect(items[1].prices).toEqual({ Swiggy: 180 });
    expect(coupons).toHaveLength(1);
    expect(coupons[0]).toMatchObject({ code: 'SWIGGY50', platform: 'Swiggy', percentOff: 50 });
  });

  it('never attributes a coupon to an unknown app', () => {
    const guesses = buildScreenshotGuesses([
      shot('anon-coupon.png', 'offer\nCoupon MYCODE1\n50% off'),
    ]);

    expect(toStoreData(guesses).coupons).toEqual([]);
  });

  it('treats an unknown screenshot as an order, keeping its items', () => {
    const guesses = buildScreenshotGuesses([shot('mystery.png', 'Paneer Tikka 250')]);

    const { items, coupons } = toStoreData(guesses);
    expect(items).toHaveLength(1);
    expect(items[0].sourcePlatform).toBeUndefined();
    expect(coupons).toEqual([]);
  });

  it('moves items to another basket when the app is corrected', () => {
    const guesses = buildScreenshotGuesses([shot('a.png', 'Swiggy\nPaneer Tikka 250')]);

    const corrected = assignPlatform(guesses, 'a.png', 'Toing');
    expect(toStoreData(corrected).items[0].prices).toEqual({ Toing: 250 });
  });

  it('gives items from different apps distinct ids', () => {
    const guesses = buildScreenshotGuesses([
      shot('a.png', 'Swiggy\nPaneer Tikka 250'),
      shot('b.png', 'Zomato\nPaneer Tikka 250'),
    ]);

    const { items } = toStoreData(guesses);
    expect(new Set(items.map((entry) => entry.id)).size).toBe(items.length);
  });

  it('keeps genuinely different dishes on separate rows', () => {
    const guesses = buildScreenshotGuesses([
      shot('a.png', 'Swiggy\nPaneer Tikka 250\nMasala Dosa 180'),
      shot('b.png', 'Zomato\nPaneer Tikka 260\nMasala Dosa 190'),
    ]);

    expect(toStoreData(guesses).items.map((entry) => entry.name)).toEqual([
      'Paneer Tikka',
      'Masala Dosa',
    ]);
  });
});

describe('the same dish photographed on three different apps', () => {
  const threeApps = buildScreenshotGuesses([
    shot('swiggy.png', 'Swiggy\nPaneer Tikka 250'),
    shot('zomato.png', 'Zomato\nPaneer Tikka 280'),
    shot('toing.png', 'Toing\nPaneer Tikka 220'),
  ]);

  it('becomes one row rather than three', () => {
    expect(toStoreData(threeApps).items).toHaveLength(1);
  });

  it('carries the price from each app on that one row', () => {
    const [dish] = toStoreData(threeApps).items;

    expect(dish.name).toBe('Paneer Tikka');
    expect(dish.prices).toEqual({ Swiggy: 250, Zomato: 280, Toing: 220 });
  });

  it('is fully priced, so no platform has to estimate it', () => {
    const { items } = toStoreData(threeApps);

    expect(hasEstimatedPrices(items, 'Swiggy')).toBe(false);
    expect(hasEstimatedPrices(items, 'Zomato')).toBe(false);
    expect(hasEstimatedPrices(items, 'Toing')).toBe(false);
  });

  it('leaves the third app empty when only two were photographed', () => {
    const { items } = toStoreData(threeApps.slice(0, 2));

    expect(items[0].prices.Toing).toBeUndefined();
    expect(hasEstimatedPrices(items, 'Toing')).toBe(true);
  });

  it('still treats quantity as the order, not a per-app figure', () => {
    const guesses = buildScreenshotGuesses([
      shot('swiggy.png', 'Swiggy\nPaneer Tikka 2 250'),
      shot('zomato.png', 'Zomato\nPaneer Tikka 2 280'),
    ]);

    expect(toStoreData(guesses).items[0].quantity).toBe(2);
  });
});

describe('mergeLines', () => {
  it('ignores case, punctuation and spacing when matching names', () => {
    const merged = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 1, platform: 'Swiggy' },
      { name: 'paneer  tikka!', price: 280, quantity: 1, platform: 'Zomato' },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].prices).toEqual({ Swiggy: 250, Zomato: 280 });
  });

  it('keeps the first spelling it saw, since that reads best in the table', () => {
    const merged = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 1, platform: 'Swiggy' },
      { name: 'PANEER TIKKA', price: 280, quantity: 1, platform: 'Zomato' },
    ]);

    expect(merged[0].name).toBe('Paneer Tikka');
  });

  it('does not let a second screenshot restate a price already known', () => {
    const merged = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 1, platform: 'Swiggy' },
      { name: 'Paneer Tikka', price: 999, quantity: 1, platform: 'Swiggy' },
    ]);

    expect(merged[0].prices.Swiggy).toBe(250);
  });

  it('still records a price for an app the first screenshot could not name', () => {
    const merged = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
      { name: 'Paneer Tikka', price: 280, quantity: 1, platform: 'Zomato' },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].prices).toEqual({ Zomato: 280 });
  });

  it('keeps the quantity from the first sighting', () => {
    const merged = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 2, platform: 'Swiggy' },
      { name: 'Paneer Tikka', price: 280, quantity: 1, platform: 'Zomato' },
    ]);

    expect(merged[0].quantity).toBe(2);
  });

  it('gives different dishes different ids', () => {
    const merged = mergeLines([
      { name: 'Paneer Tikka', price: 250, quantity: 1, platform: 'Swiggy' },
      { name: 'Masala Dosa', price: 180, quantity: 1, platform: 'Swiggy' },
    ]);

    expect(new Set(merged.map((entry) => entry.id)).size).toBe(2);
  });
});