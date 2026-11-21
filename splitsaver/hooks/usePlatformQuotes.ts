'use client';

import { useMemo } from 'react';
import { useParsedDataStore, type OrderItem } from '@/store/useParsedDataStore';
import { useSelectedPlatformStore } from '@/store/useSelectedPlatformStore';
import { computeBestPlatform, type PlatformBreakdown } from '@/utils/optimizationEngine';
import { mergeCoupons } from '@/utils/coupons';
import { groupItemsByPlatform, pickBasket, type Basket } from '@/utils/baskets';

export type PlatformQuotes = {
  /** The basket being priced, or null when no item has a known app yet. */
  basket: Basket | null;
  /** Every app represented in the parsed items. */
  baskets: Basket[];
  /** Items whose source app has not been detected or confirmed. */
  unattributed: OrderItem[];
  results: PlatformBreakdown[];
};

/**
 * Prices the order on every platform, cheapest first.
 *
 * Both the comparison table on `/optimize` and the split on `/split` read from
 * this, so the total a platform is chosen for is the total that gets divided.
 *
 * **Every item is priced, not just one app's basket.** Items are consolidated
 * across screenshots, so a dish photographed only on Zomato is still part of the
 * order and still has to be costed on Swiggy and Toing. Picking a single basket
 * would silently drop it from two of the three totals.
 *
 * `computeBestPlatform` prices one order on all three platforms, so the coupon
 * list must cover all three rather than just one app. Offers read from a
 * screenshot replace the demo entry sharing their code; an app with no uploaded
 * offer still falls back to its demo ones, so the comparison stays populated.
 */
export const usePlatformQuotes = (): PlatformQuotes => {
  const items = useParsedDataStore((state) => state.items);
  const coupons = useParsedDataStore((state) => state.coupons);
  const sourcePlatform = useSelectedPlatformStore((state) => state.sourcePlatform);

  return useMemo<PlatformQuotes>(() => {
    const { baskets, unattributed } = groupItemsByPlatform(items);
    const basket = pickBasket(baskets, sourcePlatform);

    return {
      basket,
      baskets,
      unattributed,
      results: computeBestPlatform(items, mergeCoupons(coupons)),
    };
  }, [items, coupons, sourcePlatform]);
};