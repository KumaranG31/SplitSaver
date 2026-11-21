'use client';

import { useUploadStore } from '@/store/useUploadStore';
import { motion } from 'framer-motion';
import { Trash2, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useRef } from 'react';

export default function UploadPage() {
  const { files, addFiles, removeFile, clear } = useUploadStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // Blob URLs must be created once per file selection, not on every render,
  // and revoked when the selection changes or the page unmounts.
  const previews = useMemo(
    () =>
      files.map((file) =>
        file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      ),
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

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    addFilesFrom(event.dataTransfer.files);
  };

  return (
    <section
      className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <motion.div
        className="glass p-8 text-center"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <UploadCloud size={48} className="mx-auto mb-4 text-swiggy" />
        <p className="mb-4 text-app-muted">
          Drag &amp; drop your order screenshots here, or{' '}
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
        <p className="mb-4 text-xs text-app-muted">
          Screenshot the same order from as many apps as you like. Each dish is matched up
          across them, so you end up with one row per item and a price per app. Your coupon
          screenshots come later.
        </p>

        {files.length > 0 && (
          <>
            <ul className="mt-4 max-w-md space-y-2 text-left">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
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
            <button type="button" onClick={clear} className="btn btn-secondary mt-4">
              Clear all
            </button>
          </>
        )}
      </motion.div>

      <div className="mt-6 flex space-x-4">
        <Link href="/" className="btn btn-secondary">
          &larr; Back
        </Link>
        <Link
          href="/verify"
          className="btn btn-primary"
          aria-disabled={files.length === 0}
        >
          Continue &rarr;
        </Link>
      </div>
    </section>
  );
}
