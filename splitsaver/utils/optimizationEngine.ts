import type { OrderItem } from '@/store/useParsedDataStore';
import type { Platform } from '@/store/useSelectedPlatformStore';

export type { Platform };

export type Coupon = {
  code: string;
  /** The app this code can actually be applied to. */
  platform: Platform;
  /**
   * Which account the code came from, when the user screenshotted offers from
   * more than one login. Purely descriptive: it never changes what a coupon is
   * worth, but it stops two accounts' identical codes looking like one.
   */
  accountLabel?: string;
  /**
   * Flat discount in rupees. Ignored when `percentOff` is present, so an offer
   * never carries two competing values.
   */
  discount?: number;
  /**
   * Percentage taken off the item subtotal, e.g. `50` for "50% off". Takes
   * precedence over `discount`.
   */
  percentOff?: number;
  /**
   * Cap on the resolved discount, as in "50% off up to Rs 120". Omit it for
   * uncapped offers.
   */
  maxDiscount?: number;
  /**
   * Minimum order value required. Tested against the item subtotal only, so
   * delivery fees and tax cannot push an order over the threshold.
   */
  minOrder?: number;
};

/**
 * Resolves a coupon to the rupee value it is worth on a given item subtotal,
 * applying its percentage or flat amount and then its cap.
 *
 * Returns 0 for a coupon worth nothing, so callers can skip it.
 */
export const couponValue = (coupon: Coupon, itemSubtotal: number): number => {
  const raw =
    coupon.percentOff !== undefined
      ? (Math.max(0, itemSubtotal) * coupon.percentOff) / 100
      : coupon.discount ?? 0;

  if (!Number.isFinite(raw) || raw <= 0) return 0;

  const capped = Math.min(raw, coupon.maxDiscount ?? Infinity);
  return Number.isFinite(capped) && capped > 0 ? capped : 0;
};

export type PlatformBreakdown = {
  platform: Platform;
  /** Sum of price x quantity across items. */
  subtotal: number;
  /** Per-item fees entered during verification. */
  itemFees: number;
  /** Per-item tax entered during verification. */
  tax: number;
  /** Flat per-platform delivery fee. */
  deliveryFee: number;
  /** Discount actually applied after min-order and cap rules. */
  discount: number;
  /** Coupon code that produced the discount, if any. */
  coupon: string | null;
  /** Never below zero. */
  total: number;
  /**
   * True when any item's price for this platform was borrowed from another app
   * rather than read from this app's screenshot.
   */
  estimated: boolean;
};

/** Flat delivery fee charged by each platform, in rupees. */
export const PLATFORM_FEES: Record<Platform, number> = {
  Swiggy: 30,
  Zomato: 25,
  Toing: 20,
};

export const PLATFORMS = Object.keys(PLATFORM_FEES) as Platform[];

/** Order-level charges that do not vary by platform. */
export type ItemTotals = {
  itemFees: number;
  tax: number;
};

/**
 * Resolves what one item costs on one platform.
 *
 * Prefers the price read from that platform's own screenshot. When none was
 * captured it borrows a price from another platform, which keeps a single-app
 * upload comparable across all three, and reports the borrow so the caller can
 * mark the figure as an estimate rather than a measurement.
 */
export const resolvePrice = (
  item: OrderItem,
  platform: Platform,
): { price: number; estimated: boolean } => {
  const own = item.prices[platform];
  if (typeof own === 'number' && Number.isFinite(own)) return { price: own, estimated: false };

  for (const candidate of PLATFORMS) {
    const value = item.prices[candidate];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return { price: value, estimated: true };
    }
  }

  return { price: 0, estimated: true };
};

/**
 * Rolls per-item fees and tax up into order-level totals.
 *
 * There is deliberately no subtotal here: with a price per platform, a subtotal
 * only exists once you have picked a platform. Use `subtotalFor` for that.
 */
export const summarizeItems = (items: OrderItem[]): ItemTotals =>
  items.reduce<ItemTotals>(
    (acc, item) => ({
      itemFees: acc.itemFees + (item.platformFee ?? 0) * item.quantity,
      tax: acc.tax + (item.tax ?? 0) * item.quantity,
    }),
    { itemFees: 0, tax: 0 },
  );

/** Item subtotal for one platform, at that platform's own prices. */
export const subtotalFor = (items: OrderItem[], platform: Platform): number =>
  items.reduce(
    (sum, item) => sum + resolvePrice(item, platform).price * item.quantity,
    0,
  );

/**
 * Whether a platform's total leans on borrowed prices.
 *
 * True when at least one item had no price of its own for this platform, so the
 * comparison for it rests on assumptions rather than screenshots.
 */
export const hasEstimatedPrices = (items: OrderItem[], platform: Platform): boolean =>
  items.some((item) => {
    const own = item.prices[platform];
    return !(typeof own === 'number' && Number.isFinite(own));
  });

type Candidate = {
  coupon: Coupon;
  /** Discount this coupon is worth after its cap, before order-level clamping. */
  value: number;
};

/**
 * Ranks two eligible coupons for the same platform.
 *
 * Higher value wins. Ties are broken deterministically rather than by array
 * position, so shuffling the input can never change which coupon is applied:
 * prefer the coupon with no minimum order requirement, then the lower code.
 */
const isBetter = (a: Candidate, b: Candidate): boolean => {
  if (a.value !== b.value) return a.value > b.value;

  const aRestricted = a.coupon.minOrder !== undefined;
  const bRestricted = b.coupon.minOrder !== undefined;
  if (aRestricted !== bRestricted) return !aRestricted;

  return a.coupon.code < b.coupon.code;
};

/**
 * Picks the best coupon for a platform.
 *
 * `itemSubtotal` is deliberately the item total only. Platforms test their
 * minimum order value against what you actually ordered for food, not against
 * a figure inflated by the delivery fee and tax, so those are excluded here.
 */
const bestCouponFor = (
  platform: Platform,
  coupons: Coupon[],
  itemSubtotal: number,
): Candidate | null => {
  let best: Candidate | null = null;

  for (const coupon of coupons) {
    if (coupon.platform !== platform) continue;
    if (coupon.minOrder !== undefined && itemSubtotal < coupon.minOrder) continue;

    const value = couponValue(coupon, itemSubtotal);
    if (value <= 0) continue;

    const candidate: Candidate = { coupon, value };
    if (best === null || isBetter(candidate, best)) best = candidate;
  }

  return best;
};

/**
 * Costs the same basket on every platform and returns the results sorted
 * cheapest first. Platform fee and coupon rules are applied on top of the
 * per-item fees and tax captured during verification.
 */
export const computeBestPlatform = (
  items: OrderItem[],
  coupons: Coupon[] = [],
): PlatformBreakdown[] => {
  const { itemFees, tax } = summarizeItems(items);

  const results = PLATFORMS.map((platform) => {
    const deliveryFee = PLATFORM_FEES[platform];
    const subtotal = subtotalFor(items, platform);
    const beforeDiscount = subtotal + itemFees + tax + deliveryFee;
    const best = bestCouponFor(platform, coupons, subtotal);
    // A discount can never exceed what the order is actually worth.
    const discount = Math.min(best?.value ?? 0, beforeDiscount);

    return {
      platform,
      subtotal,
      itemFees,
      tax,
      deliveryFee,
      discount,
      coupon: best?.coupon.code ?? null,
      total: Math.max(0, beforeDiscount - discount),
      estimated: hasEstimatedPrices(items, platform),
    };
  });

  return results.sort((a, b) => a.total - b.total);
};
