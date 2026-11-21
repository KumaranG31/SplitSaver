# SplitSave

Upload screenshots of a food order, let on-device OCR read the line items, compare what
the basket actually costs across delivery platforms, and split the bill fairly.

Everything runs in the browser. No screenshots are uploaded to a server.

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Script              | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Start the dev server                                 |
| `npm run build`     | Production build (also runs the TypeScript check)    |
| `npm start`         | Serve the production build                           |
| `npm run lint`      | ESLint                                               |
| `npm run typecheck` | `tsc --noEmit`                                       |
| `npm test`          | Jest                                                 |

## Flow

1. **`/upload`** — drag in order screenshots. Non-image files are rejected. The same order
   may be photographed on several apps at once; they are all read on-device.
2. **`/verify`** — Tesseract.js reads each screenshot in sequence and detects which app it
   came from. Every dish is merged into **one row**, carrying a price for **each** app that
   was photographed. The detected app is editable per screenshot, and every cell in the table
   is editable.
3. **`/coupons`** — drop in screenshots of discount offers. These may come from different
   apps *and* different accounts, so each screenshot gets an app picker and an optional
   account name. Every offer is priced against the order you actually placed.
4. **`/optimize`** — the basket is priced on Swiggy, Zomato and Toing with per-item fees,
   tax, delivery fee and coupons applied. Totals that had to borrow a price from another app
   are marked **Estimated**. Pick a platform to order from.
5. **`/split`** — divide the total to the paisa, then copy or share over WhatsApp.

## How it works

```
app/
  layout.tsx            root shell, fonts, pre-paint theme script
  page.tsx              landing page
  upload|verify|coupons|optimize|split/
                        one route per step in the flow
  globals.css           design tokens + .glass/.btn/.field components
components/
  DataTable.tsx         editable grid: quantity + one price column per platform
  ScreenshotSourceList.tsx
                        per-screenshot app picker with detection confidence
  DarkModeToggle.tsx
hooks/
  useOCR.ts             Tesseract worker lifecycle, sequential per-file OCR
  usePlatformQuotes.ts  prices the active basket on every platform
store/
  useUploadStore.ts     order screenshots and coupon screenshots (in-memory only)
  useParsedDataStore.ts line items + extracted coupons (persisted)
  useSelectedPlatformStore.ts
  useThemeStore.ts      light/dark preference (persisted)
utils/
  optimizationEngine.ts per-platform pricing, estimate flag, coupon rules
  receiptParser.ts      OCR text -> line items
  offerParser.ts        OCR text -> coupons (flat and percentage)
  platformDetect.ts     OCR text -> app name, and order vs offer screenshot
  screenshotModel.ts    per-screenshot guesses, overrides, cross-app item merging
  baskets.ts            groups items into one basket per app
  billingCalculator.ts  equal split, remainder-safe
  coupons.ts            demo coupon data + merge with extracted offers
```

### One row per item, one price per app

A line item is not tied to a single app. `OrderItem` holds
`prices: Partial<Record<Platform, number>>`, so `Paneer Tikka` photographed on Swiggy, Zomato
and Toing becomes a single row with three prices rather than three rows.

`mergeLines` does that merging on the normalised name (case, punctuation and spacing are
ignored). A platform that already has a price for an item is never overwritten by a later
screenshot, so a second Swiggy bill cannot quietly restate it. Names that fail to match stay
on their own rows, and a bad merge is corrected by editing the name.

### Pricing

`resolvePrice` decides what one item costs on one platform. It prefers the price captured from
that platform's own screenshot and, when there is none, **borrows a price from another app**,
reporting `estimated: true` so the caller can label the figure. An explicit `0` counts as a
measured price, not a missing one.

`subtotalFor(items, platform)` totals an item at that platform's own prices;
`hasEstimatedPrices` reports whether any price on that platform had to be borrowed;
`computeBestPlatform` prices the basket everywhere, sorts cheapest first and passes
`estimated` through to every quote, which `/optimize` shows as an **Estimated** badge.

`summarizeItems` deliberately returns no subtotal: with a price per platform, a subtotal only
exists once you have chosen a platform. It rolls up per-item `platformFee` and `tax`, both of
which scale with `quantity`.

Coupon selection:

- **`minOrder` is tested against the item subtotal only.** Delivery fees and tax are
  excluded, so an order cannot qualify for a minimum-value coupon because of the fee
  added at checkout.
- **A coupon carries either `discount` (flat rupees) or `percentOff`, never both.**
  `percentOff` takes precedence when both are somehow present. `couponValue` resolves
  either shape against an item subtotal and then applies `maxDiscount`, so
  "50% off up to Rs 120" caps correctly.
- **The discount is clamped to what the order is worth**, so totals never go negative.
- **Ties are broken deterministically** — higher value wins, then the coupon with no
  `minOrder`, then the lower code. Reordering the coupon array cannot change the result.
- **A coupon only applies to its own `platform`.** `accountLabel` records which login an
  offer came from so two accounts' identical codes stay distinguishable; it never affects
  what a coupon is worth.

Platform fees and the coupons in `utils/coupons.ts` are **demo data**, not live pricing.
`SWIGGY50` is a percentage offer with a cap, so both coupon shapes are exercised.

`sourcePlatform` (which uploaded order a price came from) is stored separately from `platform`
(which app the user intends to order from).

Every item is priced on every platform. Screenshots spanning several apps used to form one
basket per app with only one priced at a time, but with items consolidated that would silently
drop a dish photographed on just the second app from two of the three totals.

### OCR

`useOCR` creates one Tesseract worker and terminates it on unmount. Files are recognised
sequentially, and results are keyed on the `files` array instance so text from a previous
selection can never be shown against a new one. Results are returned **per file**, because
each screenshot has to be attributed to its own app.

The first run downloads the `eng` language model, which is why the first upload is slower
than subsequent ones.

### Detecting the app and the screenshot type

`detectPlatform` counts brand occurrences per app across a single screenshot's text. A
platform must strictly out-score its rivals: one mention of Swiggy and one of Zomato is
ambiguous, not a weak signal, so it returns nothing and the item is held as unattributed
rather than filed under a coin flip. One occurrence is low confidence, two or more is
treated as settled.

`classifyScreenshot` scores order vocabulary against offer vocabulary and picks the stronger,
because bills and promo banners share words like "total" and "offer". A screenshot with
neither signal is `unknown`, which the model treats as an order — a misfiled coupon costs
nothing, dropped line items do not.

### Offers

`parseOfferText` reads a coupon code plus a discount from a screenshot and supports both
shapes: a flat rupee amount and a percentage with an optional cap ("50% off up to Rs 120").
It refuses to return an offer unless it can identify both a code and a discount worth
something, and drops implausible percentages and amounts as OCR noise. A fabricated discount
would silently understate the real total, so ambiguity resolves to "no offer".

The screenshot is split into one block per code, and a code's terms are read only from its
own block. Searching the whole text instead would give every code on the screen whichever
discount appeared first — a screen listing `SWIGGY50 50% off up to 120` and `ZOMATO75 75% off
up to 200` would apply 50% to both. Terms printed *above* the first code are kept as a
preamble, since some banners lead with the discount.

Extracted offers replace the demo entry sharing their code; an app with no uploaded offer
still falls back to its demo ones so the comparison stays populated.

### Parsing

OCR output is never clean, so `parseReceiptText` is a heuristic: the right-most amount on a
line is the unit price, an adjacent `x2` / `2x` / bare integer is the quantity, and whatever
remains is the item name. Rows that look like totals, tax, delivery charges or savings lines
are dropped.

It is a starting point, not a receipt parser. Correct the values on the order step.

### State

Order screenshots and coupon screenshots live in separate stores, so arriving at the coupon
step never disturbs the order the user already confirmed. Neither is persisted: zustand's
`persist` middleware JSON-serialises state, and a `File` reduces to `{}`. Rehydrating would
hand the OCR pipeline empty objects instead of readable blobs, so a page reload clears the
selection. Parsed items, the chosen platform and the theme do persist.

## Theming

Colours are CSS custom properties declared on `:root` and `:root.dark`, exposed to Tailwind
through `@theme inline`. Components use semantic utilities (`bg-app-bg`, `text-app-muted`,
`border-divider`) rather than hardcoded white/alpha values, so light mode is a real palette
rather than an icon swap.

A small inline script in `layout.tsx` applies the persisted theme before first paint,
otherwise the server-rendered light palette would flash on every load.

## Testing

```bash
npm test
```

Coverage spans the pricing engine, the receipt parser, the offer parser, app detection,
cross-app item merging, the equal-split arithmetic, both upload stores, and the `DataTable`,
`/verify` and `/coupons` components.

`__tests__/verifyRenderPhase.test.tsx` lives in its own file on purpose: React emits its
"cannot update a component while rendering" warning only once per component, so a test sharing
a file with any other test that reassigns a store would find the warning already consumed and
pass against the bug.
