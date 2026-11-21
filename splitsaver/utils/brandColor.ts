import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS } from './optimizationEngine';

export type BrandColorScores = Record<Platform, number>;

export type VisualGuess = {
  platform: Platform | null;
  confidence: number;
  matched: string | null;
  scores: BrandColorScores;
};

export const emptyBrandColorScores = (): BrandColorScores => ({
  Swiggy: 0,
  Zomato: 0,
  Toing: 0,
});

const BRAND_HUES: { platform: Platform; from: number; to: number; label: string }[] = [
  { platform: 'Swiggy', from: 16, to: 42, label: 'orange' },
  { platform: 'Zomato', from: 342, to: 360, label: 'red' },
  { platform: 'Zomato', from: 0, to: 12, label: 'red' },
  { platform: 'Toing', from: 160, to: 196, label: 'teal' },
];

const rgbToHue = (r: number, g: number, b: number): number => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return -1;

  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
};

export const addBrandColorSample = (
  scores: BrandColorScores,
  r: number,
  g: number,
  b: number,
  weight = 1,
): void => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  if (max < 0.35 || max === 0 || (max - min) / max < 0.45) return;

  const hue = rgbToHue(r, g, b);
  if (hue < 0) return;

  const brand = BRAND_HUES.find((entry) => hue >= entry.from && hue <= entry.to);
  if (brand) scores[brand.platform] += weight;
};

export const guessPlatformFromColors = (scores: BrandColorScores): VisualGuess => {
  const ranked = PLATFORMS.map((platform) => ({
    platform,
    score: scores[platform],
  })).sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  const total = ranked.reduce((sum, entry) => sum + entry.score, 0);

  if (!top || top.score < 40 || total === 0) {
    return { platform: null, confidence: 0, matched: null, scores };
  }

  if (second && top.score < second.score * 1.4) {
    return { platform: null, confidence: 0, matched: null, scores };
  }

  const label = BRAND_HUES.find((entry) => entry.platform === top.platform)?.label ?? 'colour';
  return {
    platform: top.platform,
    confidence: Math.min(0.9, 0.55 + (top.score / total) * 0.4),
    matched: `${label} brand colour`,
    scores,
  };
};
