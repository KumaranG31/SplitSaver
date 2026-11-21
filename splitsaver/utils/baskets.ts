import type { OrderItem } from '@/store/useParsedDataStore';
import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS } from './optimizationEngine';

export type Basket = {
  platform: Platform;
  items: OrderItem[];
};

/**
 * Groups parsed items into one basket per delivery app.
 *
 * Screenshots are attributed to an app during verification, so items from
 * several apps can be present at once. Items with no detected or confirmed
 * platform are reported separately under `unattributed` rather than being
 * guessed into a basket, because silently filing them under the wrong app
 * corrupts the comparison the whole feature exists to produce.
 */
export const groupItemsByPlatform = (
  items: OrderItem[],
): { baskets: Basket[]; unattributed: OrderItem[] } => {
  const byPlatform = new Map<Platform, OrderItem[]>();
  const unattributed: OrderItem[] = [];

  for (const item of items) {
    if (item.sourcePlatform === undefined) {
      unattributed.push(item);
      continue;
    }
    const existing = byPlatform.get(item.sourcePlatform);
    if (existing) existing.push(item);
    else byPlatform.set(item.sourcePlatform, [item]);
  }

  // Keep PLATFORMS order so the basket list is stable across renders.
  const baskets = PLATFORMS.filter((platform) => byPlatform.has(platform)).map(
    (platform) => ({ platform, items: byPlatform.get(platform) as OrderItem[] }),
  );

  return { baskets, unattributed };
};

/**
 * Chooses the basket to price when more than one app is represented.
 *
 * A confirmed selection always wins. Otherwise the only non-empty basket is
 * used, and if several remain the largest is chosen, since that is the order the
 * user most likely cares about. Returns null when nothing has a platform yet.
 */
export const pickBasket = (
  baskets: Basket[],
  selected: Platform | null,
): Basket | null => {
  if (baskets.length === 0) return null;

  if (selected !== null) {
    const match = baskets.find((basket) => basket.platform === selected);
    if (match) return match;
  }

  if (baskets.length === 1) return baskets[0];

  return baskets.reduce((a, b) => (b.items.length > a.items.length ? b : a));
};