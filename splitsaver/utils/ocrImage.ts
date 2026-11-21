import {
  addBrandColorSample,
  emptyBrandColorScores,
  guessPlatformFromColors,
  type VisualGuess,
} from './brandColor';

/**
 * Screenshot preparation for OCR.
 *
 * Tesseract is trained on scans and document photos, not on app screenshots: the
 * text is small, sits in separated cards with wide gutters, and is often white
 * on a coloured background. Two changes do most of the work.
 *
 * - **Scale.** Tesseract wants a capital letter roughly 30px tall. A screenshot
 *   of a receipt has much smaller text, and every character it cannot resolve is
 *   a wrong quantity or a missing digit in a price, so the image is scaled up
 *   towards that target. Anything already large enough is left alone rather than
 *   enlarged into blur.
 * - **Greyscale with consistent polarity.** Colour is noise to the recogniser,
 *   and screenshots are often light text on a dark header. Alpha is composited
 *   onto white, the page's average brightness decides whether the image is a dark
 *   theme, and that theme is inverted. Both modes therefore reach Tesseract as
 *   dark text on white.
 *
 * Anything unsupported or oversized falls back to the file as supplied, because a
 * screenshot that recognises a little worse still beats one that fails outright.
 */

/** Tesseract's comfortable width for screen text, in pixels. */
const TARGET_WIDTH = 1600;

/** Largest canvas produced, to stay inside the 32MP texture limit. */
const MAX_AREA = 16_000_000;

const HEADER_WEIGHT = 3;
const HEADER_FRACTION = 0.35;

export type PreparedImage = {
  image: HTMLCanvasElement | Blob;
  width: number;
  height: number;
  visual: VisualGuess;
};

/** The scale that brings `width` towards the target, never shrinking the image. */
export const scaleFor = (width: number): number => {
  if (!Number.isFinite(width) || width <= 0) return 1;
  // Upscale towards the legible width, but only ever down to fit the area cap.
  const legible = Math.max(1, TARGET_WIDTH / width);
  const fits = Math.sqrt(MAX_AREA / (width * width));
  return Math.min(legible, fits);
};

/** Whether a canvas can be produced in this environment at all. */
const canDraw = (): boolean =>
  typeof document !== 'undefined' && typeof document.createElement === 'function';

/**
 * Scale, invert and desaturate a screenshot for recognition.
 *
 * Returns the input unchanged when the browser cannot decode it, so recognition
 * still runs rather than the upload failing.
 */
export const prepareForOcr = async (file: Blob): Promise<PreparedImage> => {
  const noVisual = guessPlatformFromColors(emptyBrandColorScores());
  const original = { image: file, width: 0, height: 0, visual: noVisual };

  if (!canDraw() || typeof createImageBitmap !== 'function') return original;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return original;
  }

  try {
    const scale = scaleFor(bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) return original;

    context.drawImage(bitmap, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    const data = pixels.data;
    const scores = emptyBrandColorScores();
    const headerEnd = height * HEADER_FRACTION;
    let totalLuma = 0;
    let count = 0;

    for (let y = 0; y < height; y += 1) {
      const weight = y < headerEnd ? HEADER_WEIGHT : 1;
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3] / 255;
        const r = data[index] * alpha + 255 * (1 - alpha);
        const g = data[index + 1] * alpha + 255 * (1 - alpha);
        const b = data[index + 2] * alpha + 255 * (1 - alpha);

        addBrandColorSample(scores, r, g, b, weight);

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;
        count += 1;
        data[index] = luma;
        data[index + 1] = luma;
        data[index + 2] = luma;
        data[index + 3] = 255;
      }
    }

    const isDark = count > 0 && totalLuma / count < 128;
    if (isDark) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }

    context.putImageData(pixels, 0, 0);
    return { image: canvas, width, height, visual: guessPlatformFromColors(scores) };
  } catch {
    // A tainted or over-large canvas is not worth failing an upload over.
    return original;
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
};
