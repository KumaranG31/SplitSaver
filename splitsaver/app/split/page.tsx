'use client';

import { useMemo, useState } from 'react';
import { useSelectedPlatformStore } from '@/store/useSelectedPlatformStore';
import { usePlatformQuotes } from '@/hooks/usePlatformQuotes';
import { splitEqually } from '@/utils/billingCalculator';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Copy, Share2 } from 'lucide-react';

export default function SplitPage() {
  const { platform } = useSelectedPlatformStore();
  const { results } = usePlatformQuotes();
  const [people, setPeople] = useState(2);
  const [copied, setCopied] = useState(false);

  // The quote for the platform chosen on /optimize, so the amount being split
  // always matches the amount that platform was recommended at.
  const quote = useMemo(
    () => results.find((entry) => entry.platform === platform) ?? null,
    [results, platform],
  );

  const total = quote?.total ?? 0;
  const shares = useMemo(() => splitEqually(total, people), [total, people]);

  const summary = useMemo(() => {
    const lines = shares.map(
      (share, index) => `Person ${index + 1}: \u20b9${share.toFixed(2)}`,
    );
    return `Split for ${people} ${people === 1 ? 'person' : 'people'} (Total: \u20b9${total.toFixed(2)})\n${lines.join('\n')}`;
  }, [shares, people, total]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handlePeopleChange = (value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    setPeople(Math.min(100, Math.max(1, parsed)));
  };

  if (!platform || !quote) {
    return (
      <section className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-app-muted">
          No platform selected. Go back and pick one to see the split.
        </p>
        <Link href="/optimize" className="btn btn-secondary">
          &larr; Back to Optimize
        </Link>
      </section>
    );
  }

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-col items-center justify-center p-4">
      <motion.div
        className="glass w-full max-w-2xl p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h2 className="mb-4 text-center text-2xl font-bold">Split the Bill</h2>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-app-muted">Platform</dt>
            <dd className="font-medium">{platform}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Items</dt>
            <dd>&#8377;{quote.subtotal.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Fees + tax</dt>
            <dd>&#8377;{(quote.itemFees + quote.tax).toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Delivery</dt>
            <dd>&#8377;{quote.deliveryFee.toFixed(2)}</dd>
          </div>
          <div>
            <dt className="text-app-muted">Coupon</dt>
            <dd>
              {quote.coupon
                ? `${quote.coupon} (-\u20b9${quote.discount.toFixed(2)})`
                : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-app-muted">Total</dt>
            <dd className="text-lg font-semibold">&#8377;{quote.total.toFixed(2)}</dd>
          </div>
        </dl>

        <div className="mb-4 flex items-center justify-center gap-2">
          <label htmlFor="people" className="text-app-muted">
            People:
          </label>
          <input
            id="people"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={people}
            onChange={(event) => handlePeopleChange(event.target.value)}
            className="field w-20 text-center"
          />
        </div>

        <ul className="mb-4 space-y-2">
          {shares.map((share, index) => (
            <li
              key={index}
              className="flex justify-between border-b border-divider py-1 last:border-b-0"
            >
              <span>Person {index + 1}</span>
              <span>&#8377;{share.toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="flex justify-center gap-4">
          <button type="button" onClick={handleCopy} className="btn btn-primary">
            <Copy size={16} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(summary)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-whatsapp"
          >
            <Share2 size={16} /> WhatsApp
          </a>
        </div>

        <div className="mt-6 flex justify-end">
          <Link href="/optimize" className="btn btn-secondary">
            &larr; Back
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
