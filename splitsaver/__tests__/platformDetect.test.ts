import { classifyScreenshot, detectPlatform } from '@/utils/platformDetect';
import { parseOfferText } from '@/utils/offerParser';
import { parseReceiptText } from '@/utils/receiptParser';
import { couponValue } from '@/utils/optimizationEngine';
import type { Platform } from '@/store/useSelectedPlatformStore';
import {
  addBrandColorSample,
  emptyBrandColorScores,
  guessPlatformFromColors,
  type VisualGuess,
} from '@/utils/brandColor';

describe('detectPlatform', () => {
  it('reads the app from brand text in a receipt', () => {
    expect(detectPlatform('Swiggy\nOrder #1234\nPaneer Tikka 250').platform).toBe('Swiggy');
    expect(detectPlatform('zomato order confirmation').platform).toBe('Zomato');
    expect(detectPlatform('TOING your cart').platform).toBe('Toing');
  });

  it('survives the spacing mistakes OCR makes on a logo', () => {
    expect(detectPlatform('Sw iggy Instamart').platform).toBe('Swiggy');
    expect(detectPlatform('zomatoo eatin').platform).toBe('Zomato');
  });

  it('reports low confidence for a single mention', () => {
    const guess = detectPlatform('Swiggy\nPaneer Tikka 250');

    expect(guess.platform).toBe('Swiggy');
    expect(guess.confidence).toBeLessThan(0.9);
  });

  it('raises confidence when the brand appears more than once', () => {
    expect(detectPlatform('Swiggy\nswiggy order\nItem total 680').confidence).toBe(0.9);
  });

  it('refuses to guess when a single mention ties with a rival', () => {
    // One mention each is ambiguity, not a weak signal.
    const guess = detectPlatform('Ordered from Swiggy, will also try Zomato');

    expect(guess.platform).toBeNull();
    expect(guess.confidence).toBe(0);
  });

  it('does not let one mention outscore a rival that appears twice', () => {
    const guess = detectPlatform('Swiggy\nZomato\nzomato\nItem total 680');

    expect(guess.platform).toBe('Zomato');
  });

  it('refuses to guess when two apps are equally likely', () => {
    const guess = detectPlatform('swiggy zomato toing');
    expect(guess.platform).toBeNull();
    expect(guess.confidence).toBe(0);
  });

  it('returns nothing for text with no brand in it', () => {
    expect(detectPlatform('Paneer Tikka 250\nMasala Dosa 180')).toEqual({
      platform: null,
      confidence: 0,
      matched: null,
    });
    expect(detectPlatform('   ').platform).toBeNull();
  });
});

describe('detectPlatform with visual signals', () => {
  const visual = (platform: Platform, confidence = 0.8): VisualGuess => {
    const scores = emptyBrandColorScores();
    scores[platform] = 100;
    return {
      platform,
      confidence,
      matched: `${platform} brand colour`,
      scores,
    };
  };

  it('uses brand colour when the text has no app name', () => {
    expect(detectPlatform('Paneer Tikka 250', visual('Swiggy')).platform).toBe('Swiggy');
  });

  it('lets a strong text signal beat a weak colour signal', () => {
    const guess = detectPlatform('Swiggy\nswiggy order', visual('Zomato', 0.6));
    expect(guess.platform).toBe('Swiggy');
  });

  it('refuses to choose when strong text and colour disagree', () => {
    const guess = detectPlatform('Swiggy\nswiggy order', visual('Zomato', 0.8));
    expect(guess.platform).toBeNull();
    expect(guess.confidence).toBe(0);
  });
});

describe('brand colour scoring', () => {
  it('recognises a dominant brand hue', () => {
    const scores = emptyBrandColorScores();
    for (let index = 0; index < 12; index += 1) addBrandColorSample(scores, 241, 90, 34, 10);

    expect(guessPlatformFromColors(scores)).toMatchObject({
      platform: 'Swiggy',
      matched: 'orange brand colour',
    });
  });

  it('does not guess when brand hues are close', () => {
    const scores = emptyBrandColorScores();
    for (let index = 0; index < 10; index += 1) {
      addBrandColorSample(scores, 241, 90, 34, 10);
      addBrandColorSample(scores, 220, 40, 50, 9);
    }

    expect(guessPlatformFromColors(scores).platform).toBeNull();
  });
});

describe('classifyScreenshot', () => {
  it('recognises a bill', () => {
    expect(classifyScreenshot('Order total 751\nDelivery fee 25\nGST 36')).toBe('order');
  });

  it('recognises an offer', () => {
    expect(
      classifyScreenshot('Apply coupon\nFlat 150 off on your order\nPromo code SWIGGY50'),
    ).toBe('coupon');
  });

  it('gives the stronger signal the benefit of the doubt', () => {
    // Both words appear, but a promo banner mentions offer terms repeatedly.
    expect(classifyScreenshot('offer offer offer\norder total 100')).toBe('coupon');
    expect(classifyScreenshot('Item total\nGST\noffer')).toBe('order');
  });

  it('reports unknown when neither signal appears', () => {
    expect(classifyScreenshot('Paneer Tikka 250')).toBe('unknown');
    expect(classifyScreenshot('')).toBe('unknown');
  });
});

describe('parseOfferText', () => {
  it('reads a percentage offer with a cap', () => {
    const coupons = parseOfferText('Coupon SWIGGY50\n50% off up to 120', 'Swiggy');

    expect(coupons).toHaveLength(1);
    expect(coupons[0]).toMatchObject({
      code: 'SWIGGY50',
      platform: 'Swiggy',
      percentOff: 50,
      maxDiscount: 120,
    });
    expect(couponValue(coupons[0], 800)).toBe(120);
  });

  it('reads a flat rupee offer', () => {
    const coupons = parseOfferText('promo code: ZOMATO100\nFlat Rs 100 off', 'Zomato');

    expect(coupons[0]).toMatchObject({ code: 'ZOMATO100', discount: 100 });
  });

  it('reads a minimum order value', () => {
    const coupons = parseOfferText(
      'Coupon SWIGGY200\nFlat 200 off on orders above 500',
      'Swiggy',
    );

    expect(coupons[0]).toMatchObject({ discount: 200, minOrder: 500 });
  });

  it('attributes the offer to the platform it was given', () => {
    expect(parseOfferText('Coupon ABC123\n50% off', 'Toing')[0].platform).toBe('Toing');
  });

  it('drops a code with no discount we can trust', () => {
    expect(parseOfferText('Coupon SWIGGY50', 'Swiggy')).toEqual([]);
    expect(parseOfferText('Your order has been placed', 'Swiggy')).toEqual([]);
  });

  it('rejects an implausible percentage or amount as OCR noise', () => {
    expect(parseOfferText('Coupon BAD1\n999% off', 'Swiggy')).toEqual([]);
    expect(parseOfferText('Coupon BAD2\n99999 off', 'Swiggy')).toEqual([]);
  });

  it('ignores a code that is only digits or only letters', () => {
    expect(parseOfferText('Coupon 12345\n50% off', 'Swiggy')).toEqual([]);
    expect(parseOfferText('Coupon ABCDEF\n50% off', 'Swiggy')).toEqual([]);
  });

  it('returns each code once even when it appears repeatedly', () => {
    const coupons = parseOfferText(
      'Coupon SWIGGY50\n50% off\nApply SWIGGY50\nSWIGGY50\n50% off',
      'Swiggy',
    );

    expect(coupons.filter((coupon) => coupon.code === 'SWIGGY50')).toHaveLength(1);
  });

  it('gives each code its own terms when a screenshot lists several offers', () => {
    const coupons = parseOfferText(
      ['Coupon SWIGGY50', '50% off up to 120', 'Coupon ZOMATO75', '75% off up to 200'].join(
        '\n',
      ),
      'Swiggy',
    );

    // The second code must not inherit the first one's discount.
    expect(coupons[0]).toMatchObject({ code: 'SWIGGY50', percentOff: 50, maxDiscount: 120 });
    expect(coupons[1]).toMatchObject({ code: 'ZOMATO75', percentOff: 75, maxDiscount: 200 });
  });

  it('reads terms printed before the code', () => {
    const coupons = parseOfferText(['50% off up to 120', 'Coupon SWIGGY50'].join('\n'), 'Swiggy');

    expect(coupons).toHaveLength(1);
    expect(coupons[0]).toMatchObject({ percentOff: 50, maxDiscount: 120 });
  });

  it('does not leak one offer\'s minimum order into the next', () => {
    const coupons = parseOfferText(
      ['Coupon SWIGGY200', 'Flat 200 off on orders above 500', 'Coupon ZOMATO75', '75% off'].join(
        '\n',
      ),
      'Swiggy',
    );

    expect(coupons[0].minOrder).toBe(500);
    expect(coupons[1].minOrder).toBeUndefined();
  });

  it('handles empty text', () => {
    expect(parseOfferText('', 'Swiggy')).toEqual([]);
  });
});

describe('screenshots feeding the basket', () => {
  it('does not mistake a coupon line for a purchased item', () => {
    const items = parseReceiptText('Paneer Tikka 250\nCoupon SWIGGY50\nYou saved 50');

    expect(items.map((item) => item.name)).toEqual(['Paneer Tikka']);
  });
});