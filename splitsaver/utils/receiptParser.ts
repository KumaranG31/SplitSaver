export type ParsedLine = {
  name: string;
  price: number;
  quantity: number;
};

/**
 * Lines that are totals, charges, savings or metadata rather than purchased items.
 *
 * A noise word only disqualifies a line when a figure or the end of the line
 * follows it, so a dish genuinely called `Total Rava` survives while
 * `Item Total 680` and `Grand Total` do not. Matching on the word alone would
 * also swallow real items, which is worse than a stray total: a phantom row
 * inflates the basket, a dropped row loses a dish from the order.
 */
const NOISE_WORDS = [
  'grand\\s*total',
  'item\\s*total',
  'items\\s*total',
  'order\\s*total',
  'sub\\s*-?\\s*total',
  'total',
  'amount',
  'amount\\s*due',
  'amount\\s*paid',
  'payable',
  'net\\s*amount',
  'tax',
  'gst',
  'igst',
  'sgst',
  'cgst',
  'vat',
  'gst\\s*(?:and|&)\\s*fees',
  'delivery\\s*(?:fee|fees|charge|charges)?',
  'free\\s*delivery',
  'packaging',
  'small\\s*fee',
  'service\\s*charge',
  'handling\\s*charge',
  'convenience\\s*fee',
  'discount',
  'discounts',
  'coupon',
  'offer',
  'offers',
  'promo',
  'savings?',
  'saved',
  'you\\s*(?:have\\s*)?saved',
  'you\\s*pay',
  'paid',
  'balance',
  'due',
  'bill',
  'bill\\s*total',
  'order\\s*id',
  'invoice',
  'thank',
  'thanks',
  'tip',
  'free',
  'no\\s*cost',
  'applied',
  'membership',
  'wallet',
  'cashback',
  'reward\\s*points',
].join('|');

const NOISE_LINE = new RegExp(`^(?:${NOISE_WORDS})(?=\\s*[:\u20b9]?\\s*\\d|$)`, 'i');

/**
 * Section headings printed above the items, which are neither a dish nor a
 * price. Requiring the whole line to be the heading keeps a dish whose name
 * merely starts with `Order` — `Order 66` — in the basket.
 */
const HEADER_LINE =
  /^(?:my\s*order|your\s*order|order\s*(?:summary|details|history)|cart(?:\s*items?)?|item(?:s)?(?:\s*(?:ordered|list))?|bill(?:\s*total)?|receipt|invoice|payment|delivery\s*address|restaurant|offers?|coupons?|menu|added\s*items?|you\s*ordered)\s*:?$/i;

/** Words that appear in the price column but never belong to a dish name. */
const JUNK_TOKENS = new Set([
  'mrp',
  'only',
  'pc',
  'pcs',
  'qty',
  'nos',
  'rs',
  'rs.',
  'inr',
  'x',
  '|',
  '-',
  '\u2013',
  '+',
  '=',
  '/',
  '@',
  '\u20b9',
]);

/**
 * Lines made only of these words are app chrome, not dish names. Used to decide
 * whether a line without a price is worth holding on to as the name of the row
 * whose price sits on the next line.
 */
const NON_NAME_WORDS = new Set([
  'add',
  'again',
  'bestseller',
  'cart',
  'change',
  'checkout',
  'choose',
  'customise',
  'customize',
  'delete',
  'details',
  'edit',
  'instructions',
  'item',
  'items',
  'min',
  'minutes',
  'more',
  'new',
  'no',
  'non',
  'nonveg',
  'note',
  'notes',
  'offer',
  'offers',
  'pc',
  'pcs',
  'qty',
  'rating',
  'ratings',
  'recommended',
  'remove',
  'repeat',
  'save',
  'see',
  'select',
  'stars',
  'swiggy',
  'tap',
  'toing',
  'veg',
  'view',
  'zomato',
]);

/** Leading list markers such as `1.`, `2)`, `12 -`. */
const LIST_MARKER = /^\d{1,3}\s*[.)\-]\s+|^\d{1,3}\s*[.\-]\s+/;

const AMOUNT = /^(\d{1,7}(?:\.\d{1,2})?)$/;

/** A token that is only digits, e.g. `4`, or a bracketed count such as `(4)`. */
const COUNT = /^\(?\d{1,2}\)?$/;

/** A single-digit count, used when OCR drops the `x` next to a quantity. */
const BARE_COUNT = /^\(?([1-9])\)?$/;

const parseAmount = (token: string): number | null => {
  const cleaned = token
    .replace(/^(?:rs\.?|inr|[\u20b9$])\s*/i, '')
    .replace(/\s*(?:rs\.?|inr|[\u20b9$])$/i, '')
    .replace(/,/g, '')
    .trim();
  if (!AMOUNT.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

/** Rupees are compared after rounding, so a decimal price still multiplies cleanly. */
const matchesMultiple = (total: number, unit: number, quantity: number): boolean =>
  Math.abs(total - unit * quantity) < 0.01;

/**
 * Smallest unit price a dish is assumed to have.
 *
 * Used to keep an implausible amount from being read as a unit price. `Idli 1
 * 30` is one idli at Rs 30, not thirty idlis at a rupee each, and only the size
 * of the figures says so: `1` is a sensible count but not a sensible price,
 * while `Samosa 20 60` is three samosas at Rs 20 and both readings look fine.
 */
const MIN_UNIT_PRICE = 10;

/** Whether a trailing figure is a line total for the unit price before it. */
const readsAsLineTotal = (ratio: number, unit: number): boolean =>
  Number.isInteger(ratio) && ratio >= 2 && ratio <= 99 && unit >= MIN_UNIT_PRICE;

type Marker = {
  quantity: number;
  /** Exclusive token index where the item name ends. */
  nameEnd: number;
};

type PricedMarker = Marker & { price: number };

/**
 * Reads a count written immediately before an amount, as `x2`, `2x`, `x 2` or a
 * bare `4`.
 *
 * The loosest form, a bare integer, is tried last: it is the one that reads a
 * stray digit as a quantity rather than as part of a name.
 */
const markerBefore = (tokens: string[], index: number): Marker | null => {
  if (index <= 0) return null;

  const adjacent = tokens[index - 1];
  const attached = /^[x*\u00d7]\s*(\d{1,2})$|^(\d{1,2})\s*[x*\u00d7]$/i.exec(adjacent);
  if (attached) {
    return { quantity: Number(attached[1] ?? attached[2]), nameEnd: index - 1 };
  }
  const bare = BARE_COUNT.exec(adjacent);
  if (bare) return { quantity: Number(bare[1]), nameEnd: index - 1 };

  // OCR frequently splits a marker across two tokens, giving `x 2` or `2 x`.
  const before = tokens[index - 2];
  if (before && /^[x*\u00d7]$/i.test(before) && COUNT.test(adjacent)) {
    return { quantity: Number(adjacent.replace(/[()]/g, '')), nameEnd: index - 2 };
  }
  if (before && COUNT.test(before) && /^[x*\u00d7]$/i.test(adjacent)) {
    return { quantity: Number(before.replace(/[()]/g, '')), nameEnd: index - 2 };
  }

  return null;
};

/**
 * Reads a count written at the very start of the line, the way Zomato writes it:
 * `2 x Masala Dosa`, `x2 Masala Dosa`.
 */
const leadingMarker = (tokens: string[]): Marker | null => {
  const first = tokens[0];
  if (first === undefined) return null;

  const single = /^[x*\u00d7]?\d{1,2}[x*\u00d7]?$/i.exec(first);
  if (single && /[x*\u00d7]/i.test(first)) {
    return { quantity: Number(first.replace(/[x*\u00d7]/gi, '')), nameEnd: 1 };
  }

  const second = tokens[1];
  if (second !== undefined && /^[x*\u00d7]$/i.test(second) && COUNT.test(first)) {
    return { quantity: Number(first.replace(/[()]/g, '')), nameEnd: 2 };
  }
  if (second !== undefined && COUNT.test(second) && /^[x*\u00d7]$/i.test(first)) {
    return { quantity: Number(second.replace(/[()]/g, '')), nameEnd: 2 };
  }

  return null;
};

const trailingMarker = (tokens: string[], amountIndex: number): PricedMarker | null => {
  const marker = tokens[amountIndex - 1];
  const priceToken = tokens[amountIndex - 2];
  const countToken = tokens[amountIndex];
  if (!marker || !/^[x*\u00d7]$/i.test(marker)) return null;
  if (!priceToken || !countToken) return null;

  const price = parseAmount(priceToken);
  const count = parseAmount(countToken);
  if (price === null || count === null || !Number.isInteger(count) || count < 1 || count > 20) {
    return null;
  }

  return { quantity: count, nameEnd: amountIndex - 2, price };
};

/**
 * Indices of the amounts at the end of a line, which is where the price column
 * lives.
 *
 * Only a contiguous run counts. A figure in the middle of a line — the `2` in
 * `Thali for 2 people` — is part of the text, and treating it as part of a
 * price pair would truncate the name around it.
 */
const trailingAmounts = (tokens: string[]): number[] => {
  const indices: number[] = [];
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (parseAmount(tokens[i]) === null) break;
    indices.unshift(i);
  }
  return indices;
};

/** Whether a line reads as a dish name rather than as app chrome. */
const looksLikeItemName = (line: string): boolean => {
  const words = line.split(' ').filter((word) => word.length > 0);
  if (words.length === 0 || words.length > 12) return false;
  return !words.every((word) => NON_NAME_WORDS.has(word.toLowerCase()));
};

/** Strips list markers, column labels and the leftovers of a quantity marker. */
const cleanName = (tokens: string[]): string =>
  tokens
    .filter((token) => !JUNK_TOKENS.has(token.toLowerCase()))
    .join(' ')
    .replace(LIST_MARKER, '')
    .replace(/\s+/g, ' ')
    .trim();

type Draft = {
  name: string;
  price: number;
  quantity: number;
};

/**
 * Turns one OCR line into a draft item, or null when it carries no price.
 *
 * The price a row is read at has to survive two different extra amounts:
 *
 * - **A line total.** Zomato and Swiggy print `2 x \u20b9180 = \u20b9360` when a row is
 *   for more than one unit. The left amount is the unit price, which the engine
 *   multiplies by the quantity.
 * - **A struck original.** With an offer applied, the pre-discount amount is
 *   printed next to the discounted one. OCR cannot see the strike-through, so
 *   the larger figure is taken, because the engine applies the coupon itself and
 *   counting a discounted price would discount the order twice.
 *
 * The two are told apart by arithmetic rather than by position: a line total is
 * exactly the unit price times the quantity, and a discount never raises the
 * price. Where neither can be proven, the larger amount is used, which is the
 * correct line total in the first case and the correct pre-discount price in the
 * second.
 */
const parseLine = (line: string): Draft | null => {
  const tokens = line
    .replace(/^qty\s*:?\s*/i, '')
    .replace(/(\d{1,3})\s*[x*\u00d7]\s*(\d{1,3})/gi, '$1 x $2')
    .split(' ')
    .filter((token) => token.length > 0);
  const run = trailingAmounts(tokens);
  if (run.length === 0) return null;

  const trailing = trailingMarker(tokens, run[0]);
  if (trailing) {
    return {
      name: cleanName(tokens.slice(0, trailing.nameEnd)),
      price: trailing.price,
      quantity: trailing.quantity,
    };
  }

  const leading = leadingMarker(tokens);
  const before = markerBefore(tokens, run[0]);

  let quantity = before?.quantity ?? leading?.quantity ?? undefined;
  const explicit = quantity !== undefined;
  const nameStart = leading?.nameEnd ?? 0;
  let nameEnd = before?.nameEnd ?? run[0];
  let amounts = run.map((index) => parseAmount(tokens[index]) as number);

  if (quantity === undefined && amounts.length >= 2) {
    const ratio = amounts[0] > 0 ? amounts[amounts.length - 1] / amounts[0] : 0;

    if (readsAsLineTotal(ratio, amounts[0])) {
      quantity = ratio;
    } else {
      const bare = BARE_COUNT.exec(tokens[run[0]]);
      if (bare) {
        const count = Number(bare[1]);
        const rest = amounts.slice(1);
        const restRatio = rest[0] > 0 ? rest[rest.length - 1] / rest[0] : 0;

        if (rest.length === 1 || readsAsLineTotal(restRatio, rest[0])) {
          quantity = count;
          amounts = rest;
          nameEnd = run[0];
        } else if (amounts[amounts.length - 1] > amounts[0]) {
          nameEnd = run[0] + 1;
        }
      } else if (amounts[amounts.length - 1] > amounts[0]) {
        nameEnd = run[0] + 1;
      }
    }
  }

  if (quantity === undefined) quantity = 1;

  const isLineTotal =
    amounts.length >= 2 &&
    quantity > 1 &&
    matchesMultiple(amounts[amounts.length - 1], amounts[0], quantity);
  const price =
    amounts.length >= 2 && explicit ? amounts[0] : isLineTotal ? amounts[0] : Math.max(...amounts);

  return { name: cleanName(tokens.slice(nameStart, nameEnd)), price, quantity };
};

/**
 * Turns raw OCR output into line items.
 *
 * Heuristic, because OCR of a phone screenshot is never clean enough for a
 * strict grammar. For every line the trailing price column gives the price, a
 * count written before the name or before the price gives the quantity, and
 * whatever remains becomes the item name. Lines without a usable price, and
 * lines that look like totals or tax rows, are discarded.
 *
 * Apps routinely print a dish and its price on separate lines, so a line holding
 * words but no figure is held as the name of the row that follows it. The hold
 * lasts one line only and is dropped by any total or charge row, which keeps a
 * section heading from being paired with an unrelated price.
 */
export const parseReceiptText = (raw: string): ParsedLine[] => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u2022*\u00b7]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const items: ParsedLine[] = [];
  let pending: string | null = null;

  for (const line of lines) {
    if (NOISE_LINE.test(line) || HEADER_LINE.test(line)) {
      pending = null;
      continue;
    }

    const draft = parseLine(line);

    if (draft === null) {
      pending = looksLikeItemName(line) ? cleanName(line.split(' ')) : null;
      continue;
    }

    const name = draft.name.length > 0 ? draft.name : (pending ?? '');
    pending = null;

    if (name.length === 0 || draft.price <= 0) continue;

    items.push({ name, price: draft.price, quantity: draft.quantity });
  }

  return items;
};