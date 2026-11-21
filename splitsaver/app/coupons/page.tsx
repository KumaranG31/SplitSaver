'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Trash2, UploadCloud } from 'lucide-react';

import { useCouponUploadStore } from '@/store/useUploadStore';
import { useParsedDataStore } from '@/store/useParsedDataStore';
import { useOCR, type OCRFileResult } from '@/hooks/useOCR';
import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS, couponValue, subtotalFor } from '@/utils/optimizationEngine';
import { parseOfferText } from '@/utils/offerParser';
import { detectPlatform } from '@/utils/platformDetect';

type CouponShot = {
  id: string;
  file: File;
  fileName: string;
  text: string;
  platform: Platform | null;
  /** Free-text name for the login this screenshot came from. */
  account: string;
};

/**
 * Collects discount coupons from screenshots that may belong to several apps and
 * several accounts.
 *
 * A code is only usable if you know which app accepts it, so every screenshot
 * gets an app and an optional account name. Values are shown against the
 * Swiggy, Zomato and Toing subtotals of the confirmed order, which is the only
 * way to tell whether an offer is worth anything on this particular basket.
 */
export default function CouponsPage() {
  const { files, addFiles, removeFile, clear } = useCouponUploadStore();
  const { items, coupons, setCoupons } = useParsedDataStore();
  const { files: ocrFiles, progress, error, isRecognizing } = useOCR(files);
  const inputRef = useRef<HTMLInputElement>(null);

  const [shots, setShots] = useState<CouponShot[]>([]);
  const parsedRef = useRef<OCRFileResult[] | null>(null);
  const filesRef = useRef<File[]>(files);

  // A fresh selection must not inherit coupons read from the previous one.
  useEffect(() => {
    if (filesRef.current === files) return;
    filesRef.current = files;
    parsedRef.current = null;
    setShots([]);
    setCoupons([]);
  }, [files, setCoupons]);

  useEffect(() => {
    if (isRecognizing || ocrFiles.length === 0 || parsedRef.current === ocrFiles) return;
    parsedRef.current = ocrFiles;
    setShots(
      ocrFiles.map(({ id, file, fileName, text, visual }, index) => ({
        id: id ?? `${fileName}-${index}`,
        file,
        fileName,
        text,
        platform: detectPlatform(text, visual).platform,
        account: '',
      })),
    );
  }, [ocrFiles, isRecognizing]);

  const previews = useMemo(
    () => files.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null)),
    [files],
  );

  useEffect(
    () => () => {
      previews.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    },
    [previews],
  );

  const addFilesFrom = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    addFiles(Array.from(list).filter((file) => file.type.startsWith('image/')));
    if (inputRef.current) inputRef.current.value = '';
  };

  const updateShot = (id: string, patch: Partial<CouponShot>) =>
    setShots((current) => current.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot)));

  // Offers are re-read whenever an app or account changes, so the store always
  // matches what the screen shows. Written from an effect rather than from inside
  // a setState updater, because React runs updaters during render.
  useEffect(() => {
    if (isRecognizing || shots.length === 0) return;
    setCoupons(
      shots.flatMap((shot) =>
        shot.platform === null
          ? []
          : parseOfferText(shot.text, shot.platform).map((coupon) => ({
              ...coupon,
              accountLabel: shot.account.trim() || undefined,
            })),
      ),
    );
  }, [shots, isRecognizing, setCoupons]);

  // What each offer is actually worth here, per app, so the user can see the
  // difference between a headline discount and a usable one.
  const values = useMemo(() => {
    const subtotals = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, subtotalFor(items, platform)]),
    ) as Record<Platform, number>;

    return coupons.map((coupon) => ({
      coupon,
      value: couponValue(coupon, subtotals[coupon.platform]),
      eligible:
        coupon.minOrder === undefined || subtotals[coupon.platform] >= coupon.minOrder,
    }));
  }, [coupons, items]);

  const hasOrder = items.length > 0;
  const unassigned = shots.filter((shot) => shot.platform === null);

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center p-4">
      <motion.div
        className="glass w-full max-w-4xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Your discount coupons</h2>
            <p className="mt-1 text-sm text-app-muted">
              Add screenshots of the offers you have. They can come from different apps and
              different accounts &mdash; just say which is which.
            </p>
          </div>
          {files.length > 0 && (
            <button type="button" onClick={clear} className="btn btn-secondary">
              Start over
            </button>
          )}
        </div>

        {!hasOrder && (
          <p className="mb-4 text-sm text-app-muted">
            No order confirmed yet, so offer values cannot be worked out.{' '}
            <Link href="/verify" className="text-swiggy underline">
              Go back to your order
            </Link>
            .
          </p>
        )}

        <div
          className="glass mb-4 p-4 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFilesFrom(event.dataTransfer.files);
          }}
        >
          <UploadCloud size={32} className="mx-auto mb-2 text-swiggy" />
          <p className="mb-2 text-app-muted">
            Drop coupon screenshots here, or{' '}
            <label className="cursor-pointer text-swiggy underline">
              click to select
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={inputRef}
                onChange={(event) => addFilesFrom(event.target.files)}
              />
            </label>
          </p>

          {files.length > 0 && (
            <ul className="space-y-2 text-left">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {previews[index] && (
                      <Image
                        src={previews[index] as string}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded object-cover"
                      />
                    )}
                    <span className="truncate text-app-fg">{file.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remove ${file.name}`}
                    className="btn btn-ghost-danger p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="mb-2 text-danger">OCR failed: {error}</p>}

        {isRecognizing && (
          <p className="mb-2 text-app-muted">
            Reading {files.length} screenshot{files.length === 1 ? '' : 's'} &mdash;{' '}
            {progress}%
          </p>
        )}

        {unassigned.length > 0 && (
          <p className="mb-3 text-sm text-danger">
            {unassigned.length} screenshot{unassigned.length === 1 ? '' : 's'} could not be
            matched to an app. Set the app below so those offers can be applied.
          </p>
        )}

        {shots.length > 0 && (
          <ul className="mb-6 space-y-2">
            {shots.map((shot, index) => {
              const uncertain = shot.platform === null;
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
                      {shot.platform === null
                        ? 'App not detected'
                        : `Read as ${shot.platform}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-app-muted">Account</span>
                      <input
                        className="field"
                        placeholder="e.g. work"
                        aria-label={`Account for ${shot.fileName}`}
                        value={shot.account}
                        onChange={(event) =>
                          updateShot(shot.id, { account: event.target.value })
                        }
                      />
                    </label>

                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-app-muted">App</span>
                      <select
                        className="rounded border border-app-border bg-app-bg px-2 py-1 text-sm"
                        value={shot.platform ?? ''}
                        aria-label={`App for ${shot.fileName}`}
                        onChange={(event) =>
                          updateShot(shot.id, {
                            platform:
                              event.target.value === ''
                                ? null
                                : (event.target.value as Platform),
                          })
                        }
                      >
                        <option value="">Unknown</option>
                        {PLATFORMS.map((platform) => (
                          <option key={platform} value={platform}>
                            {platform}
                          </option>
                        ))}
                      </select>
                    </label>

                    {previews[index] && (
                      <Image
                        src={previews[index] as string}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded object-cover"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!isRecognizing && !error && shots.length > 0 && coupons.length === 0 && (
          <p className="mb-2 text-app-muted">
            No codes were read from those screenshots. Check the app is right, or try a
            clearer screenshot.
          </p>
        )}

        {values.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                Coupons read from your screenshots, and what each is worth on your order
              </caption>
              <thead className="border-b border-divider">
                <tr>
                  <th scope="col" className="p-2 font-medium text-app-muted">Code</th>
                  <th scope="col" className="p-2 font-medium text-app-muted">App</th>
                  <th scope="col" className="p-2 font-medium text-app-muted">Account</th>
                  <th scope="col" className="p-2 font-medium text-app-muted">Offer</th>
                  <th scope="col" className="p-2 font-medium text-app-muted">Worth here</th>
                </tr>
              </thead>
              <tbody>
                {values.map(({ coupon, value, eligible }, index) => (
                  <tr
                    key={`${index}-${coupon.platform}-${coupon.code}`}
                    className="border-b border-divider last:border-b-0"
                  >
                    <td className="p-2 font-medium">{coupon.code}</td>
                    <td className="p-2">{coupon.platform}</td>
                    <td className="p-2 text-app-muted">{coupon.accountLabel ?? '—'}</td>
                    <td className="p-2">
                      {coupon.percentOff !== undefined
                        ? `${coupon.percentOff}% off`
                        : `flat ${coupon.discount}`}
                      {coupon.maxDiscount !== undefined && ` (up to ${coupon.maxDiscount})`}
                      {coupon.minOrder !== undefined && `, min ${coupon.minOrder}`}
                    </td>
                    <td className="p-2">
                      {eligible ? (
                        <span className="font-medium">&#8377;{value.toFixed(2)}</span>
                      ) : (
                        <span className="text-app-muted">
                          needs &#8377;{coupon.minOrder?.toFixed(2)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-app-muted">
          An offer only applies to its own app, and only if your order meets its minimum.
        </p>

        <div className="mt-6 flex items-center justify-between gap-4">
          <Link href="/verify" className="btn btn-secondary">
            &larr; Back to order
          </Link>
          <Link href="/optimize" className="btn btn-primary" aria-disabled={!hasOrder}>
            See the cheapest &rarr;
          </Link>
        </div>
      </motion.div>
    </section>
  );
}