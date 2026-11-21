import { parseReceiptText } from '@/utils/receiptParser';

describe('parseReceiptText', () => {
  it('extracts a plain "name price" line', () => {
    expect(parseReceiptText('Paneer Tikka 250')).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
    ]);
  });

  it('keeps multi-word item names', () => {
    expect(parseReceiptText('Garlic Butter Naan 120.50')).toEqual([
      { name: 'Garlic Butter Naan', price: 120.5, quantity: 1 },
    ]);
  });

  it('reads an x-prefixed quantity marker', () => {
    expect(parseReceiptText('Masala Dosa x3 180')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 3 },
    ]);
  });

  it('reads a suffixed quantity marker', () => {
    expect(parseReceiptText('Filter Coffee 2x 60')).toEqual([
      { name: 'Filter Coffee', price: 60, quantity: 2 },
    ]);
  });

  it('reads a bare integer between name and price as the quantity', () => {
    expect(parseReceiptText('Vada Pav 4 45')).toEqual([
      { name: 'Vada Pav', price: 45, quantity: 4 },
    ]);
  });

  it('treats a quantity of one as the default', () => {
    expect(parseReceiptText('Idli 1 30')).toEqual([{ name: 'Idli', price: 30, quantity: 1 }]);
  });

  it('strips currency symbols and thousands separators', () => {
    // The currency word is a column label, not part of the dish name.
    expect(parseReceiptText('Party Platter Rs 1,299')).toEqual([
      { name: 'Party Platter', price: 1299, quantity: 1 },
    ]);
  });

  it('strips worded currency labels', () => {
    expect(parseReceiptText('Paneer Tikka INR 250')).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
    ]);
  });

  it('keeps a dish name that ends in a number', () => {
    expect(parseReceiptText('Chicken 65 250')).toEqual([
      { name: 'Chicken 65', price: 250, quantity: 1 },
    ]);
  });

  it('strips leading list markers', () => {
    expect(parseReceiptText('1. Paneer Tikka 250')).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
    ]);
    expect(parseReceiptText('2) Masala Dosa 180')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 1 },
    ]);
  });

  it('strips bullet characters used as list markers', () => {
    expect(parseReceiptText('• Paneer Tikka 250')).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
    ]);
  });

  it('takes the right-most amount as the price', () => {
    // A figure repeated on the same row is the price printed twice, so it is
    // read once and kept out of the dish name.
    expect(parseReceiptText('Cheese Burger 249 249')).toEqual([
      { name: 'Cheese Burger', price: 249, quantity: 1 },
    ]);
  });

  it('drops total, tax and delivery rows', () => {
    const raw = [
      'Paneer Tikka 250',
      'Item Total 250',
      'Tax 18',
      'Delivery Fee 30',
      'Grand Total 298',
    ].join('\n');

    expect(parseReceiptText(raw)).toEqual([{ name: 'Paneer Tikka', price: 250, quantity: 1 }]);
  });

  it('drops lines with no price at all', () => {
    expect(parseReceiptText('Thanks for ordering with us')).toEqual([]);
  });

  it('drops a price-only line with no item name', () => {
    expect(parseReceiptText('250')).toEqual([]);
  });

  it('ignores blank lines and collapses whitespace', () => {
    const raw = '\n\n  Paneer   Tikka   250  \n\n   Masala Dosa 180\n';
    expect(parseReceiptText(raw)).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
      { name: 'Masala Dosa', price: 180, quantity: 1 },
    ]);
  });

  it('handles carriage returns from Windows-style OCR output', () => {
    expect(parseReceiptText('Paneer Tikka 250\r\nMasala Dosa 180')).toHaveLength(2);
  });

  it('returns an empty array for empty input', () => {
    expect(parseReceiptText('')).toEqual([]);
    expect(parseReceiptText('   \n  \n ')).toEqual([]);
  });
});

describe('parseReceiptText quantities', () => {
  it('reads a quantity written before the name, the way Zomato prints it', () => {
    expect(parseReceiptText('2 x Masala Dosa 180')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
    expect(parseReceiptText('x2 Masala Dosa 180')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
  });

  it('reads a marker OCR split into two tokens', () => {
    expect(parseReceiptText('Masala Dosa x 2 180')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
    expect(parseReceiptText('Masala Dosa 2 x 180')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
  });

  it('reads a unit price followed by a quantity marker', () => {
    expect(parseReceiptText('Masala Dosa 60 x 2')).toEqual([
      { name: 'Masala Dosa', price: 60, quantity: 2 },
    ]);
  });

  it('reads a quantity label in front of the count', () => {
    expect(parseReceiptText('Garlic Naan Qty 2 120')).toEqual([
      { name: 'Garlic Naan', price: 120, quantity: 2 },
    ]);
  });

  it('separates a unit price from the line total for the row', () => {
    // The engine multiplies by the quantity, so the row has to be priced at the
    // unit. 180 x 2 is the 360 the line shows.
    expect(parseReceiptText('Masala Dosa 180 360')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
    expect(parseReceiptText('Masala Dosa x2 180 360')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
  });

  it('separates a unit price from the total even for cheap items', () => {
    expect(parseReceiptText('Samosa 20 60')).toEqual([
      { name: 'Samosa', price: 20, quantity: 3 },
    ]);
  });

  it('reads a count that OCR left in front of a unit price and a total', () => {
    expect(parseReceiptText('Masala Dosa 2 180 360')).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
    ]);
  });

  it('prefers a plausible count over a rupee-sized unit price', () => {
    // One idli at Rs 30, not thirty idlis at a rupee each.
    expect(parseReceiptText('Idli 1 30')).toEqual([{ name: 'Idli', price: 30, quantity: 1 }]);
  });
});

describe('parseReceiptText discounted rows', () => {
  it('prices a row at the struck original, not the discounted figure', () => {
    // The engine applies the coupon itself, so a pre-discount price is needed to
    // avoid discounting the order twice.
    expect(parseReceiptText('Paneer Tikka 250 180')).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
    ]);
  });

  it('does the same when the row also carries a quantity', () => {
    expect(parseReceiptText('Paneer Tikka x2 250 125')).toEqual([
      { name: 'Paneer Tikka', price: 250, quantity: 2 },
    ]);
  });

  it('keeps the original price of a row an offer reduced to nothing', () => {
    expect(parseReceiptText('Masala Dosa 250 0')).toEqual([
      { name: 'Masala Dosa', price: 250, quantity: 1 },
    ]);
  });

  it('drops the MRP label without leaving it in the dish name', () => {
    expect(parseReceiptText('Masala Dosa MRP 250 180')).toEqual([
      { name: 'Masala Dosa', price: 250, quantity: 1 },
    ]);
  });
});

describe('parseReceiptText rows split across lines', () => {
  it('pairs a name with the price on the next line', () => {
    const raw = ['Masala Dosa', '2 x \u20b9180', 'Garlic Butter Naan', '\u20b9120'].join('\n');

    expect(parseReceiptText(raw)).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
      { name: 'Garlic Butter Naan', price: 120, quantity: 1 },
    ]);
  });

  it('does not let a totals row borrow the name above it', () => {
    const raw = ['Masala Dosa', 'Total', '\u20b9360'].join('\n');

    expect(parseReceiptText(raw)).toEqual([]);
  });

  it('does not pair a section heading with an unrelated price', () => {
    const raw = ['Order Summary', '\u20b9690'].join('\n');

    expect(parseReceiptText(raw)).toEqual([]);
  });

  it('ignores app chrome rather than holding it as the next item name', () => {
    const raw = ['Masala Dosa', 'Add more', '\u20b9180'].join('\n');

    expect(parseReceiptText(raw)).toEqual([]);
  });
});

describe('parseReceiptText totals and charges', () => {
  it('drops rows that a bill prints around the items', () => {
    const raw = [
      'Tip',
      '\u20b920',
      'You saved \u20b925',
      'GST and Fees',
      'Free delivery',
      'Discount',
      '\u20b954',
      'Convenience fee 12',
      'Reward Points 40',
      'Balance due',
      '\u20b90',
    ].join('\n');

    expect(parseReceiptText(raw)).toEqual([]);
  });

  it('keeps a dish whose name starts with a noise word', () => {
    expect(parseReceiptText('Total Rava 60')).toEqual([
      { name: 'Total Rava', price: 60, quantity: 1 },
    ]);
  });
});

describe('parseReceiptText on a whole screenshot', () => {
  it('reads the items out of a Zomato order and ignores the summary', () => {
    const raw = [
      'Zomato',
      'Order Summary',
      'Masala Dosa',
      '2 x \u20b9180',
      'Garlic Butter Naan',
      '\u20b9120',
      'Paneer Tikka',
      '\u20b9250 \u20b9225',
      'BESTSELLER',
      'Filter Coffee',
      '\u20b960',
      'Item Total',
      '730',
      'GST and Fees',
      '\u20b954',
      'Delivery Fee',
      '\u20b929',
      'You saved \u20b925',
      'Total',
      '\u20b9773',
    ].join('\n');

    expect(parseReceiptText(raw)).toEqual([
      { name: 'Masala Dosa', price: 180, quantity: 2 },
      { name: 'Garlic Butter Naan', price: 120, quantity: 1 },
      { name: 'Paneer Tikka', price: 250, quantity: 1 },
      { name: 'Filter Coffee', price: 60, quantity: 1 },
    ]);
  });
});
