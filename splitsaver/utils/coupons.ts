import type { Coupon } from '@/utils/optimizationEngine';

/**
 * Placeholder offers used when a screenshot yields nothing usable, so the
 * comparison still has something to work with. Values are demo data, not live
 * pricing.
 *
 * Each platform pairs an always-available small offer with a larger one gated
 * behind a minimum order value, and the gated Swiggy offer is percentage-off
 * with a cap, so both shapes of offer are exercised.
 */
export const DEMO_COUPONS: Coupon[] = [
  { code: 'SWIGGY10', discount: 10, platform: 'Swiggy' },
  { code: 'SWIGGY50', percentOff: 50, maxDiscount: 120, platform: 'Swiggy', minOrder: 400 },
  { code: 'ZOMATO5', discount: 5, platform: 'Zomato' },
  { code: 'ZOMATO75', discount: 75, platform: 'Zomato', minOrder: 300 },
  { code: 'TOING2', discount: 2, platform: 'Toing' },
];

/**
 * Combines coupons read from screenshots with the demo set.
 *
 * An extracted coupon always wins over a demo entry sharing its code, so a real
 * offer replaces its placeholder instead of competing with it. Demo entries are
 * only used when nothing usable was extracted.
 */
export const mergeCoupons = (extracted: Coupon[], demo: Coupon[] = DEMO_COUPONS): Coupon[] => {
  if (extracted.length === 0) return demo;

  const seen = new Set(extracted.map((coupon) => coupon.code));
  return [...extracted, ...demo.filter((coupon) => !seen.has(coupon.code))];
};