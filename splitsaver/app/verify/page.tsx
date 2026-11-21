'use client';

import { useUploadStore } from '@/store/useUploadStore';
import { useParsedDataStore } from '@/store/useParsedDataStore';
import { useOCR, type OCRFileResult } from '@/hooks/useOCR';
import { DataTable } from '@/components/DataTable';
import ScreenshotSourceList from '@/components/ScreenshotSourceList';
import type { Platform } from '@/store/useSelectedPlatformStore';
import {
  applyPlatformAssignment,
  assignPlatform,
  buildScreenshotGuesses,
  toStoreData,
  type ScreenshotGuess,
} from '@/utils/screenshotModel';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export default function VerifyPage() {
  const { files, clear } = useUploadStore();
  const { items, setItems, setCoupons } = useParsedDataStore();
  const { files: ocrFiles, progress, error, isRecognizing } = useOCR(files);

  const [screenshots, setScreenshots] = useState<ScreenshotGuess[]>([]);

  const parsedRef = useRef<OCRFileResult[] | null>(null);
  const filesRef = useRef<File[]>(files);

  useEffect(() => {
    if (filesRef.current === files) return;
    filesRef.current = files;
    parsedRef.current = null;
    setScreenshots([]);
    setItems([]);
    setCoupons([]);
  }, [files, setItems, setCoupons]);

  useEffect(() => {
    if (error || isRecognizing || ocrFiles.length === 0 || parsedRef.current === ocrFiles) return;
    parsedRef.current = ocrFiles;

    const guesses = buildScreenshotGuesses(ocrFiles);
    const { items: parsedItems, coupons: parsedCoupons } = toStoreData(guesses);
    setScreenshots(guesses);
    setItems(parsedItems);
    setCoupons(parsedCoupons);
  }, [ocrFiles, isRecognizing, error, setItems, setCoupons]);

  const handleAssign = (identifier: string, platform: Platform | null) => {
    const shot = screenshots.find(
      (entry) => entry.id === identifier || entry.fileName === identifier,
    );
    if (!shot) return;

    setScreenshots((current) => assignPlatform(current, identifier, platform));
    setItems(applyPlatformAssignment(useParsedDataStore.getState().items, shot.id, platform));
  };

  const hasItems = items.length > 0;
  const canEdit = files.length > 0 && !isRecognizing;
  const unassigned = screenshots.filter((shot) => shot.platform === null && shot.kind !== 'coupon');

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
            <h2 className="text-2xl font-bold">Confirm your order</h2>
            <p className="mt-1 text-sm text-app-muted">
              Every dish you photographed is listed once, with a price for each app you used.
              Correct anything that was misread, then move on to your discount coupons.
            </p>
          </div>
          {files.length > 0 && (
            <button type="button" onClick={clear} className="btn btn-secondary">
              Start over
            </button>
          )}
        </div>

        {files.length === 0 && (
          <p className="text-app-muted">
            No screenshots uploaded yet.{' '}
            <Link href="/upload" className="text-swiggy underline">
              Upload some
            </Link>
            .
          </p>
        )}

        {files.length > 0 && (
          <>
            {error && <p className="mb-2 text-danger">OCR failed: {error}</p>}

            {isRecognizing && (
              <p className="mb-2 text-app-muted">
                Reading {files.length} screenshot{files.length === 1 ? '' : 's'} &mdash;{' '}
                {progress}%
              </p>
            )}

            {!isRecognizing && !error && !hasItems && (
              <p className="mb-2 text-app-muted">
                No line items were detected. Add them below by hand, or go back and try a
                clearer screenshot.
              </p>
            )}

            {unassigned.length > 0 && (
              <p className="mb-3 text-sm text-danger">
                {unassigned.length} screenshot{unassigned.length === 1 ? '' : 's'} could not be
                matched to an app. Set the app below so those items can be compared.
              </p>
            )}

            <ScreenshotSourceList screenshots={screenshots} onAssign={handleAssign} />

            {canEdit ? (
              <DataTable />
            ) : (
              <p className="text-app-muted">Reading your screenshots&hellip;</p>
            )}
          </>
        )}

        <div className="mt-6 flex items-center justify-between gap-4">
          <Link href="/upload" className="btn btn-secondary">
            &larr; Back
          </Link>
          <Link href="/coupons" className="btn btn-primary" aria-disabled={!hasItems}>
            Add coupons &rarr;
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
