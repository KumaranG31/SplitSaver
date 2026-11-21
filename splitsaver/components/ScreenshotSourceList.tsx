'use client';

import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS } from '@/utils/optimizationEngine';
import type { ScreenshotGuess } from '@/utils/screenshotModel';

const CONFIDENCE_LOW = 0.7;

/**
 * Lets the user correct the app detected for each screenshot.
 *
 * OCR reading a delivery app's logo is unreliable, so detection is treated as a
 * suggestion rather than a fact. Every screenshot shows its guess and confidence,
 * and picking a different app overrides the guess for good. Screenshots whose
 * app is still unknown are highlighted, because until they are assigned their
 * items cannot be compared against anything.
 */
export default function ScreenshotSourceList({
  screenshots,
  onAssign,
}: {
  screenshots: ScreenshotGuess[];
  onAssign: (identifier: string, platform: Platform | null) => void;
}) {
  if (screenshots.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-lg font-semibold">Screenshots</h3>
      <p className="mb-3 text-sm text-app-muted">
        Each screenshot is matched to a delivery app by its text. Check the
        detection and correct anything it got wrong.
      </p>

      <ul className="space-y-2">
        {screenshots.map((shot) => {
          const uncertain = shot.platform === null || shot.confidence < CONFIDENCE_LOW;

          return (
            <li
              key={shot.id}
              className={`glass flex flex-wrap items-center justify-between gap-3 p-3 ${
                uncertain ? 'border-danger/40' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{shot.fileName}</p>
                <p className="text-xs text-app-muted">
                  {shot.kind === 'coupon' ? 'Coupon / offer' : 'Order'}
                  {shot.platform === null
                    ? ' — app not detected'
                    : ` — read as ${shot.platform}`}
                  {shot.platform !== null && shot.confidence < CONFIDENCE_LOW
                    ? ' (low confidence)'
                    : ''}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs">
                <span className="text-app-muted">App</span>
                <select
                  className="rounded border border-app-border bg-app-bg px-2 py-1 text-sm"
                  value={shot.platform ?? ''}
                  aria-label={`Delivery app for ${shot.fileName}`}
                  onChange={(event) => {
                    const value = event.target.value;
                    onAssign(shot.id, value === '' ? null : (value as Platform));
                  }}
                >
                  <option value="">Unknown</option>
                  {PLATFORMS.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-app-muted">
        Changing an app here moves that screenshot&rsquo;s items and coupons to it.
      </p>
    </div>
  );
}