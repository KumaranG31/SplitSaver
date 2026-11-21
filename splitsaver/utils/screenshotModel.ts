import type { Platform } from '@/store/useSelectedPlatformStore';
import type { OrderItem } from '@/store/useParsedDataStore';
import type { Coupon } from '@/utils/optimizationEngine';
import { parseReceiptText } from './receiptParser';
import { parseOfferText } from './offerParser';
import { classifyScreenshot, detectPlatform, type ScreenshotKind } from './platformDetect';
import type { OCRFileResult } from '@/hooks/useOCR';

export const CONFIDENT = 0.9;

export type ScreenshotGuess = {
  id: string;
  file: File;
  fileName: string;
  platform: Platform | null;
  confidence: number;
  matched: string | null;
  kind: ScreenshotKind;
  confirmed: boolean;
  text: string;
};

export const buildScreenshotGuesses = (files: OCRFileResult[]): ScreenshotGuess[] =>
  files.map(({ id, file, fileName, text, visual }, index) => {
    const guess = detectPlatform(text, visual);
    return {
      id: id ?? `${fileName}-${index}`,
      file,
      fileName,
      platform: guess.platform,
      confidence: guess.confidence,
      matched: guess.matched,
      kind: classifyScreenshot(text),
      confirmed: false,
      text,
    };
  });

export const assignPlatform = (
  guesses: ScreenshotGuess[],
  identifier: string,
  platform: Platform | null,
): ScreenshotGuess[] =>
  guesses.map((guess) =>
    guess.id === identifier || guess.fileName === identifier
      ? {
          ...guess,
          platform,
          confidence: platform === null ? 0 : CONFIDENT,
          matched: platform === null ? null : 'set by you',
          confirmed: true,
        }
      : guess,
  );

const normaliseName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

type MergedLine = {
  name: string;
  price: number;
  quantity: number;
  platform?: Platform;
  sourceShotId?: string;
};

type DraftItem = OrderItem & { quantities: number[] };

const modalQuantity = (quantities: number[]): number => {
  const counts = new Map<number, number>();
  for (const quantity of quantities) {
    counts.set(quantity, (counts.get(quantity) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
};

export const mergeLines = (lines: MergedLine[]): OrderItem[] => {
  const merged = new Map<string, DraftItem>();

  for (const line of lines) {
    const key = normaliseName(line.name);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        id: key,
        name: line.name,
        quantity: line.quantity,
        quantities: [line.quantity],
        prices: line.platform === undefined ? {} : { [line.platform]: line.price },
        sourcePlatform: line.platform,
        sourceShotId: line.sourceShotId,
        unattributedPrice: line.platform === undefined ? line.price : undefined,
      });
      continue;
    }

    existing.quantities.push(line.quantity);
    if (line.platform !== undefined && existing.prices[line.platform] === undefined) {
      existing.prices[line.platform] = line.price;
    }
    if (line.platform === undefined && existing.unattributedPrice === undefined) {
      existing.unattributedPrice = line.price;
    }
    if (existing.sourcePlatform === undefined) existing.sourcePlatform = line.platform;
    if (existing.sourceShotId === undefined) existing.sourceShotId = line.sourceShotId;
  }

  return [...merged.values()].map(({ quantities, ...item }) => ({
    ...item,
    quantity: modalQuantity(quantities),
  }));
};

export const applyPlatformAssignment = (
  items: OrderItem[],
  shotId: string,
  platform: Platform | null,
): OrderItem[] =>
  items.map((item) => {
    if (item.sourceShotId !== shotId) return item;

    const next: OrderItem = {
      ...item,
      prices: { ...item.prices },
      sourcePlatform: platform ?? undefined,
    };

    if (platform === null) {
      const previous = item.sourcePlatform;
      if (previous !== undefined) {
        const price = next.prices[previous];
        if (price !== undefined && next.unattributedPrice === undefined) {
          next.unattributedPrice = price;
        }
        delete next.prices[previous];
      }
      return next;
    }

    const previous = item.sourcePlatform;
    const price =
      item.prices[platform] ??
      item.unattributedPrice ??
      (previous === undefined ? undefined : item.prices[previous]);
    if (price !== undefined && next.prices[platform] === undefined) next.prices[platform] = price;
    if (previous !== undefined && previous !== platform) delete next.prices[previous];
    if (next.unattributedPrice !== undefined) delete next.unattributedPrice;

    return next;
  });

export const toStoreData = (
  guesses: ScreenshotGuess[],
): { items: OrderItem[]; coupons: Coupon[] } => {
  const lines: MergedLine[] = [];
  const coupons: Coupon[] = [];

  guesses.forEach((guess) => {
    const platform = guess.platform ?? undefined;

    if (guess.kind !== 'coupon') {
      parseReceiptText(guess.text).forEach((line) => {
        lines.push({ ...line, platform, sourceShotId: guess.id });
      });
      return;
    }

    if (guess.platform !== null) {
      coupons.push(...parseOfferText(guess.text, guess.platform));
    }
  });

  return { items: mergeLines(lines), coupons };
};
