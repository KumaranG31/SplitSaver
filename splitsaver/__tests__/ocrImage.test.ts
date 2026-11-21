import { prepareForOcr, scaleFor } from '@/utils/ocrImage';

/**
 * The pixel work needs a real canvas, which jsdom does not provide. What is
 * worth pinning down here is the fallback path — every screenshot must still
 * reach the recogniser when preparation is impossible — and the sizing rule,
 * which decides whether the image is legible at all.
 */
describe('scaleFor', () => {
  it('scales up a narrow screenshot towards the legible width', () => {
    expect(scaleFor(640)).toBeCloseTo(2.5);
  });

  it('leaves an already wide screenshot alone rather than blurring it', () => {
    expect(scaleFor(1600)).toBe(1);
    expect(scaleFor(3000)).toBe(1);
  });

  it('keeps the canvas inside the texture limit for a very large image', () => {
    // 20000 x 20000 is far past what a canvas can hold, so the area has to cap
    // the scale even though shrinking an image is otherwise avoided.
    const scale = scaleFor(20000);
    expect(scale).toBeLessThan(1);
    expect((20000 * scale) ** 2).toBeLessThanOrEqual(16_000_000);
  });

  it('scales nothing for a width it cannot measure', () => {
    expect(scaleFor(0)).toBe(1);
    expect(scaleFor(Number.NaN)).toBe(1);
  });
});

describe('prepareForOcr', () => {
  const file = () => new File(['x'], 'shot.png', { type: 'image/png' });

  it('passes the file through untouched when it cannot be decoded', async () => {
    const source = file();

    // jsdom has no createImageBitmap, which is exactly the situation this
    // fallback exists for: recognition has to run on the original.
    const prepared = await prepareForOcr(source);

    expect(prepared.image).toBe(source);
  });

  it('passes the file through when decoding fails', async () => {
    const source = file();
    const globals = globalThis as { createImageBitmap?: unknown };
    globals.createImageBitmap = jest.fn(async () => {
      throw new Error('unsupported format');
    });
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext');

    try {
      const prepared = await prepareForOcr(source);

      expect(prepared.image).toBe(source);
      expect(getContext).not.toHaveBeenCalled();
    } finally {
      delete globals.createImageBitmap;
      getContext.mockRestore();
    }
  });
});