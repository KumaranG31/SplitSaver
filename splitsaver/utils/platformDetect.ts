import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS } from './optimizationEngine';
import type { VisualGuess } from './brandColor';

export type ScreenshotKind = 'order' | 'coupon' | 'unknown';

const PLATFORM_SIGNALS: Record<Platform, RegExp> = {
  Swiggy: /sw\s*[il1]\s*g\s*g\s*y|instamart|dineout/i,
  Zomato: /zom\s*ato|\beatin(?:g)?\b/i,
  Toing: /to\s*ing/i,
};

const countOccurrences = (text: string, pattern: RegExp): { count: number; matched: string | null } => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = text.match(new RegExp(pattern.source, flags)) ?? [];
  return { count: matches.length, matched: matches[0] ?? null };
};

const ORDER_SOURCE =
  'item\\s?total|sub\\s?-?\\s?total|order\\s?total|bill\\s?total|grand\\s?total|amount\\s?paid|paid\\s?via|delivery\\s?(fee|charge)|gst|invoice|order\\s?id|your\\s?cart|items?\\s?ordered|restaurant';

const COUPON_SOURCE =
  'coupon|promo\\s?code|offer|discount|voucher|apply\\s?code|flat\\s?off|percent\\s?off|%\\s?off|off\\s?up\\s?to|bank\\s?offer|scratch\\s?card|win\\s?up\\s?to|free\\s?delivery';

const ORDER_SIGNALS = new RegExp(ORDER_SOURCE, 'gi');
const COUPON_SIGNALS = new RegExp(COUPON_SOURCE, 'gi');

export type PlatformGuess = {
  platform: Platform | null;
  confidence: number;
  matched: string | null;
};

const CONFIDENCE_STRONG = 0.9;
const CONFIDENCE_WEAK = 0.5;

const detectPlatformFromText = (text: string): PlatformGuess & { scores: Record<Platform, number> } => {
  const scores = Object.fromEntries(PLATFORMS.map((platform) => [platform, 0])) as Record<
    Platform,
    number
  >;
  let matched: string | null = null;

  if (!text.trim()) return { platform: null, confidence: 0, matched: null, scores };

  for (const platform of PLATFORMS) {
    const result = countOccurrences(text, PLATFORM_SIGNALS[platform]);
    scores[platform] = result.count;
    if (result.matched !== null && matched === null) matched = result.matched;
  }

  const ranked = PLATFORMS.map((platform) => ({ platform, count: scores[platform] })).sort(
    (a, b) => b.count - a.count,
  );
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top.count === 0 || (second && second.count === top.count)) {
    return { platform: null, confidence: 0, matched: null, scores };
  }

  return {
    platform: top.platform,
    confidence: top.count >= 2 ? CONFIDENCE_STRONG : CONFIDENCE_WEAK,
    matched,
    scores,
  };
};

export const detectPlatform = (text: string, visual?: VisualGuess | null): PlatformGuess => {
  const fromText = detectPlatformFromText(text);
  const fromColors = visual?.platform ? visual : null;

  if (!fromColors) {
    return {
      platform: fromText.platform,
      confidence: fromText.confidence,
      matched: fromText.matched,
    };
  }

  if (fromText.platform === fromColors.platform) {
    return {
      platform: fromColors.platform,
      confidence: Math.max(fromText.confidence, fromColors.confidence),
      matched: fromText.matched ?? fromColors.matched,
    };
  }

  if (fromText.platform === null) {
    return {
      platform: fromColors.platform,
      confidence: fromColors.confidence,
      matched: fromColors.matched,
    };
  }

  if (fromColors.confidence >= 0.7 && fromText.confidence < CONFIDENCE_STRONG) {
    return {
      platform: fromColors.platform,
      confidence: fromColors.confidence,
      matched: fromColors.matched,
    };
  }

  if (fromText.confidence >= CONFIDENCE_STRONG && fromColors.confidence < 0.7) {
    return {
      platform: fromText.platform,
      confidence: fromText.confidence,
      matched: fromText.matched,
    };
  }

  return { platform: null, confidence: 0, matched: null };
};

export const classifyScreenshot = (text: string): ScreenshotKind => {
  if (!text.trim()) return 'unknown';

  const orderScore = (text.match(ORDER_SIGNALS) ?? []).length;
  const couponScore = (text.match(COUPON_SIGNALS) ?? []).length;

  if (couponScore > orderScore) return 'coupon';
  if (orderScore > 0) return 'order';
  return 'unknown';
};
