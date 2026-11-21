import type { Coupon, Platform } from '@/utils/optimizationEngine';

/**
 * Extracts coupon offers from the text of a screenshot.
 *
 * OCR of a promo banner is noisy, so this is deliberately conservative: it only
 * returns an offer when it can identify both a code and a discount that is worth
 * something. Anything ambiguous is dropped rather than guessed at, because a
 * fabricated discount silently understates the real total.
 */

/** Promo codes are short uppercase alphanumerics, sometimes with separators. */
const CODE_SOURCE = '[A-Z0-9][A-Z0-9_-]{2,19}';

/** `SWIGGY50`, `code: SWIGGY50`, `promo code ZOMATO75`. */
const CODE_LINE = new RegExp(
  `(?:promo\\s?code|offer\\s?code|coupon\\s?code|coupon|code)\\s*[:\\-]?\\s*(${CODE_SOURCE})`,
  'i',
);

/** A bare code on its own line, e.g. a screenshot showing just `SWIGGY50`. */
const BARE_CODE_LINE = new RegExp(`^\\s*(${CODE_SOURCE})\\s*$`);

/** `50% off`, `50 % OFF`, `50%OFF`. */
const PERCENT_OFF = /(\d{1,2})\s?%\s?(?:off|discount)?/i;

/** `flat 150 off`, `flat Rs 150 off`, `150 off`. */
const FLAT_OFF = /(?:flat\s+)?(?:rs\.?\s*|₹\s*)?(\d{1,6})\s?(?:off)\b/i;

/** `up to 120`, `up to Rs 120`, `max 120`. */
const CAP = /up\s?to\s*(?:rs\.?\s*|₹\s*)?(\d{1,6})|max(?:imum)?\s*(?:rs\.?\s*|₹\s*)?(\d{1,6})/i;

/** `on orders above 400`, `min order 400`, `above Rs 400`. */
const MIN_ORDER =
  /(?:orders?\s*(?:above|over)|min(?:imum)?\s*(?:order|value|bill)?|above|over)\s*(?:rs\.?\s*|₹\s*)?(\d{2,7})/i;

/** A discount above this is almost certainly OCR noise or a total, not an offer. */
const MAX_PLAUSIBLE_OFF = 5000;
const MAX_PLAUSIBLE_PERCENT = 90;

const isPlausibleCode = (code: string): boolean =>
  /[A-Z]/.test(code) && /\d/.test(code) && !/^\d+$/.test(code);

const toNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const firstCapture = (match: RegExpExecArray | null): string | undefined => {
  if (!match) return undefined;
  for (let i = 1; i < match.length; i += 1) {
    const value = match[i];
    if (value !== undefined) return value;
  }
  return undefined;
};

/**
 * Splits the screenshot into one block per promo code.
 *
 * Offers are laid out as cards: a code, then its terms on the following lines,
 * then the next code. Terms must therefore be read from a code's own block and
 * never from the whole screenshot, or every code on the screen would pick up
 * whichever discount happened to appear first.
 *
 * Lines above the first code are kept as a preamble, because some banners print
 * "50% off up to 120" *before* naming the code.
 */
const offerBlocks = (lines: string[]): { code: string; text: string }[] => {
  const blocks: { code: string; lines: string[] }[] = [];
  const preamble: string[] = [];

  for (const line of lines) {
    const code = CODE_LINE.exec(line)?.[1] ?? BARE_CODE_LINE.exec(line)?.[1];

    if (code !== undefined) {
      blocks.push({
        code,
        lines: blocks.length === 0 && preamble.length > 0 ? [...preamble, line] : [line],
      });
      preamble.length = 0;
      continue;
    }

    const current = blocks[blocks.length - 1];
    if (current !== undefined) current.lines.push(line);
    else preamble.push(line);
  }

  return blocks.map((block) => ({ code: block.code, text: block.lines.join(' ') }));
};

/**
 * Pulls every offer it can justify out of one screenshot's text.
 *
 * `platform` comes from the caller (see `detectPlatform`) rather than being
 * re-derived here, so a coupon is always attributed to the app the user or the
 * detector assigned to that screenshot.
 */
export const parseOfferText = (text: string, platform: Platform): Coupon[] => {
  if (!text.trim()) return [];

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const coupons: Coupon[] = [];
  const claimed = new Set<string>();

  const build = (code: string, source: string): void => {
    const normalised = code.toUpperCase();
    if (!isPlausibleCode(normalised) || claimed.has(normalised)) return;

    const percent = PERCENT_OFF.exec(source)?.[1];
    const flat = FLAT_OFF.exec(source)?.[1];
    const cap = toNumber(firstCapture(CAP.exec(source)));
    const minOrder = toNumber(MIN_ORDER.exec(source)?.[1]);

    const coupon: Coupon = { code: normalised, platform };

    if (percent !== undefined) {
      const percentOff = Number(percent);
      if (percentOff <= 0 || percentOff > MAX_PLAUSIBLE_PERCENT) return;
      coupon.percentOff = percentOff;
      if (cap !== undefined && cap <= MAX_PLAUSIBLE_OFF) coupon.maxDiscount = cap;
    } else if (flat !== undefined) {
      const discount = Number(flat);
      if (discount <= 0 || discount > MAX_PLAUSIBLE_OFF) return;
      coupon.discount = discount;
    } else {
      // No discount we can trust means no offer worth applying.
      return;
    }

    if (minOrder !== undefined && minOrder <= MAX_PLAUSIBLE_OFF) {
      coupon.minOrder = minOrder;
    }

    claimed.add(normalised);
    coupons.push(coupon);
  };

  for (const block of offerBlocks(lines)) build(block.code, block.text);

  return coupons;
};