'use client';

import { useSelectedPlatformStore, type Platform } from '@/store/useSelectedPlatformStore';
import { usePlatformQuotes } from '@/hooks/usePlatformQuotes';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const BRAND: Record<Platform, string> = {
  Swiggy: 'text-swiggy',
  Zomato: 'text-zomato',
  Toing: 'text-toing',
};

export default function OptimizePage() {
  const { platform, setPlatform } = useSelectedPlatformStore();
  const { results, basket, unattributed } = usePlatformQuotes();

  const best = results[0];

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center p-4">
      <motion.div
        className="glass w-full max-w-3xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="mb-1 text-center text-2xl font-bold">Best Platform Recommendation</h2>
        <p className="mb-4 text-center text-sm text-app-muted">
          {results.length === 0 || basket === null
            ? 'No items yet.'
            : 'Your whole order priced on each app. Totals marked Estimated borrowed a price from another app, and offers with no screenshot are demo data.'}
        </p>

        {unattributed.length > 0 && (
          <p className="mb-4 text-sm text-danger">
            {unattributed.length} item{unattributed.length === 1 ? '' : 's'} could not be
            matched to an app and {unattributed.length === 1 ? 'is' : 'are'} excluded from
            this comparison.
          </p>
        )}

        <div className="grid gap-3">
          {results.map((result) => {
            const isSelected = platform === result.platform;
            const isBest = best !== undefined && result.platform === best.platform;

            return (
              <div
                key={result.platform}
                className={`rounded-xl border p-4 ${
                  isSelected ? 'border-swiggy bg-surface' : 'border-divider bg-surface'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-semibold ${BRAND[result.platform]}`}>
                      {result.platform}
                    </span>
                    {isBest && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                        Best value
                      </span>
                    )}
                    {result.estimated && (
                      <span
                        className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
                        title="Some prices were taken from another app's screenshot"
                      >
                        Estimated
                      </span>
                    )}
                  </div>
                  <span className="text-xl font-semibold">
                    &#8377;{result.total.toFixed(2)}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-app-muted sm:grid-cols-4">
                  <div className="flex justify-between sm:block">
                    <dt>Items</dt>
                    <dd>&#8377;{result.subtotal.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt>Fees + tax</dt>
                    <dd>&#8377;{(result.itemFees + result.tax).toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt>Delivery</dt>
                    <dd>&#8377;{result.deliveryFee.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between sm:block">
                    <dt>Coupon</dt>
                    <dd>
                      {result.coupon
                        ? `${result.coupon} (-\u20b9${result.discount.toFixed(2)})`
                        : '\u2014'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPlatform(result.platform)}
                    className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {isSelected && <Check size={16} />}
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <Link href="/coupons" className="btn btn-secondary">
            &larr; Back
          </Link>
          <Link
            href="/split"
            className="btn btn-primary"
            aria-disabled={platform === null}
          >
            Proceed to Split &rarr;
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
