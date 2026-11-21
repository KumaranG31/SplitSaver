'use client';

import { useEffect } from 'react';
import Link from 'next/link';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('SplitSave route error:', error);
  }, [error]);

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center gap-4 p-4 text-center">
      <h2 className="text-2xl font-bold">Something went wrong</h2>
      <p className="max-w-md text-app-muted">
        {error.message || 'An unexpected error occurred while rendering this step.'}
      </p>
      {error.digest && (
        <p className="text-xs text-app-muted">Reference: {error.digest}</p>
      )}
      <div className="flex gap-4">
        <button type="button" onClick={reset} className="btn btn-primary">
          Try again
        </button>
        <Link href="/upload" className="btn btn-secondary">
          Start over
        </Link>
      </div>
    </section>
  );
}
