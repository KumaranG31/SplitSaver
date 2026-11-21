import type { Metadata } from 'next';
import Link from 'next/link';
import { Camera, GitCompareArrows, ReceiptIndianRupee, Share2, TicketPercent } from 'lucide-react';

export const metadata: Metadata = {
  title: 'SplitSave — split food orders and never overpay',
  description:
    'Upload your order screenshots, let OCR match every item across delivery platforms, compare the real cost with your own coupons, and split the bill.',
};

const STEPS = [
  {
    icon: Camera,
    title: 'Upload',
    body: 'Drop in screenshots of the same order from as many apps as you like. Everything is read on-device.',
  },
  {
    icon: ReceiptIndianRupee,
    title: 'Order',
    body: 'Every dish is matched across the apps, giving you one row per item with a price for each one. Correct anything it misread.',
  },
  {
    icon: TicketPercent,
    title: 'Coupons',
    body: 'Add screenshots of your offers, from any app and any account, and see what each is really worth on this order.',
  },
  {
    icon: GitCompareArrows,
    title: 'Optimize',
    body: 'The same basket is priced across Swiggy, Zomato and Toing with fees, tax and coupons applied.',
  },
  {
    icon: Share2,
    title: 'Split',
    body: 'Divide the total fairly to the paisa and share it over WhatsApp in one tap.',
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-12 py-12">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Stop overpaying for delivery
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-app-muted">
          SplitSave reads your order screenshots, matches each item across the apps you
          photographed, checks what the basket actually costs on every major delivery
          platform once your own coupons are applied, and works out who owes what.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/upload" className="btn btn-primary px-6 py-3 text-base">
            Start a split
          </Link>
          <Link href="/optimize" className="btn btn-secondary px-6 py-3 text-base">
            See platform pricing
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-center text-2xl font-semibold">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="glass p-5">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-swiggy/15 text-swiggy">
                  <Icon size={18} />
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-app-muted">
                  Step {index + 1}
                </span>
                <h3 className="text-lg font-semibold">{title}</h3>
              </div>
              <p className="text-sm text-app-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-center text-xs text-app-muted">
        Platform fees and coupons are illustrative demo data, not live pricing.
      </p>
    </div>
  );
}
