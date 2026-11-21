import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { usePlatformQuotes } from '@/hooks/usePlatformQuotes';
import { useSelectedPlatformStore } from '@/store/useSelectedPlatformStore';
import { useParsedDataStore, type OrderItem } from '@/store/useParsedDataStore';
import { DEMO_COUPONS } from '@/utils/coupons';
import { couponValue } from '@/utils/optimizationEngine';

jest.mock('next/link', () => {
  // requireActual, not a top-level import: jest.mock is hoisted above imports,
  // so the factory may only reach for React lazily.
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    // Spread props the way the real Link forwards them onto the anchor.
    default: ({ children, ...props }: { children: ReactNode }) =>
      createElement('a', { href: '/', ...props }, children),
  };
});

jest.mock('framer-motion', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const stub = (tag: string) => {
    const Stub = ({ children }: { children?: ReactNode }) =>
      createElement(tag, null, children);
    Stub.displayName = `Motion${tag}`;
    return Stub;
  };
  return {
    motion: { div: stub('div'), span: stub('span'), li: stub('li') },
  };
});

jest.mock('lucide-react', () => ({
  Copy: () => null,
  Share2: () => null,
  Check: () => null,
}));

/**
 * subtotal 250*2 + 180*1 = 680, fees 5*2 = 10, tax 18*2 = 36 => 726 before
 * delivery and coupons.
 *
 * Prices here read from a Swiggy screenshot only, so Zomato and Toing borrow the
 * Swiggy price for each item and their totals are flagged as estimates. That
 * keeps the subtotal at 680 everywhere, and DEMO_COUPONS then gives
 * (minOrder tested against 680):
 *   Swiggy  726 + 30 - 120 (SWIGGY50 = 50% of 680 capped at 120) = 636
 *   Zomato  726 + 25 - 75  (ZOMATO75, minOrder 300 met)         = 676
 *   Toing   726 + 20 - 2   (TOING2)                            = 744
 */
const items: OrderItem[] = [
  {
    id: 'a',
    name: 'Paneer Tikka',
    prices: { Swiggy: 250 },
    quantity: 2,
    platformFee: 5,
    tax: 18,
    sourcePlatform: 'Swiggy',
  },
  {
    id: 'b',
    name: 'Masala Dosa',
    prices: { Swiggy: 180 },
    quantity: 1,
    sourcePlatform: 'Swiggy',
  },
];

let SplitPage: typeof import('@/app/split/page').default;
let OptimizePage: typeof import('@/app/optimize/page').default;

beforeAll(async () => {
  SplitPage = (await import('@/app/split/page')).default;
  OptimizePage = (await import('@/app/optimize/page')).default;
});

beforeEach(() => {
  localStorage.clear();
  useParsedDataStore.setState({ items, coupons: [] });
  useSelectedPlatformStore.setState({ platform: null, sourcePlatform: null });
});

describe('usePlatformQuotes', () => {
  it('returns every platform priced and sorted cheapest first', () => {
    function Probe() {
      const { results } = usePlatformQuotes();
      return (
        <span data-testid="totals">
          {results.map((q) => `${q.platform}:${q.total}`).join(',')}
        </span>
      );
    }

    render(<Probe />);

    expect(screen.getByTestId('totals')).toHaveTextContent('Swiggy:636,Zomato:676,Toing:744');
  });

  it('reports which app the priced basket came from', () => {
    function Probe() {
      const { basket, baskets } = usePlatformQuotes();
      return (
        <span data-testid="basket">
          {basket?.platform ?? 'none'}/{baskets.length}
        </span>
      );
    }

    render(<Probe />);

    expect(screen.getByTestId('basket')).toHaveTextContent('Swiggy/1');
  });

  it('picks the cheapest platform, which the percentage coupon makes Swiggy', () => {
    function Probe() {
      const { results } = usePlatformQuotes();
      return <span data-testid="best">{results[0].platform}</span>;
    }

    render(<Probe />);

    expect(screen.getByTestId('best')).toHaveTextContent('Swiggy');
  });

  it('prices nothing when no OrderItem is attributed to an app', () => {
    useParsedDataStore.setState({
      items: [{ id: 'z', name: 'Dosa', prices: {}, quantity: 1 }],
      coupons: [],
    });

    function Probe() {
      const { basket, unattributed } = usePlatformQuotes();
      return (
        <span data-testid="state">
          {basket === null ? 'none' : basket.platform}/{unattributed.length}
        </span>
      );
    }

    render(<Probe />);

    expect(screen.getByTestId('state')).toHaveTextContent('none/1');
  });

  it('keeps each app in its own basket instead of merging them', () => {
    useParsedDataStore.setState({
      items: [
        { id: 's', name: 'Dosa', prices: { Swiggy: 180 }, quantity: 1, sourcePlatform: 'Swiggy' },
        { id: 'z', name: 'Dosa', prices: { Zomato: 200 }, quantity: 1, sourcePlatform: 'Zomato' },
      ],
      coupons: [],
    });

    function Probe() {
      const { baskets } = usePlatformQuotes();
      return (
        <span data-testid="baskets">
          {baskets.map((b) => `${b.platform}:${b.items.length}`).join(',')}
        </span>
      );
    }

    render(<Probe />);

    expect(screen.getByTestId('baskets')).toHaveTextContent('Swiggy:1,Zomato:1');
  });

  it('prices the order without letting the order choice change it', () => {
    // One dish, photographed on both apps, priced differently on each.
    useParsedDataStore.setState({
      items: [
        {
          id: 'dosa',
          name: 'Dosa',
          prices: { Swiggy: 180, Zomato: 200 },
          quantity: 1,
          sourcePlatform: 'Swiggy',
        },
      ],
      coupons: [],
    });
    useSelectedPlatformStore.setState({ sourcePlatform: 'Swiggy' });

    function Probe() {
      const { results } = usePlatformQuotes();
      return (
        <span data-testid="state">
          {results.find((r) => r.platform === 'Swiggy')?.subtotal}:
          {results.find((r) => r.platform === 'Zomato')?.subtotal}
        </span>
      );
    }

    const { rerender } = render(<Probe />);
    expect(screen.getByTestId('state')).toHaveTextContent('180:200');

    // Choosing Zomato means "I will order from Zomato". It must not repoint the
    // comparison at Zomato's own prices for every platform.
    act(() => {
      useSelectedPlatformStore.setState({ platform: 'Zomato' });
    });
    rerender(<Probe />);

    expect(screen.getByTestId('state')).toHaveTextContent('180:200');
  });

  it('prices an item that only appeared in the second app screenshot', () => {
    // Paneer Tikka was photographed on Swiggy, but the dosa only on Zomato. Under
    // the old one-basket-per-app rule the Zomato-only item fell outside the priced
    // basket and vanished from every total.
    useParsedDataStore.setState({
      items: [
        {
          id: 'paneer',
          name: 'Paneer Tikka',
          prices: { Swiggy: 250 },
          quantity: 1,
          sourcePlatform: 'Swiggy',
        },
        {
          id: 'dosa',
          name: 'Masala Dosa',
          prices: { Zomato: 180 },
          quantity: 1,
          sourcePlatform: 'Zomato',
        },
      ],
      coupons: [],
    });

    function Probe() {
      const { results } = usePlatformQuotes();
      // Toing borrows Paneer's 250 and Dosa's 180, so its subtotal must be 430.
      return <span data-testid="subtotal">{results.find((r) => r.platform === 'Toing')?.subtotal}</span>;
    }

    render(<Probe />);

    expect(screen.getByTestId('subtotal')).toHaveTextContent('430');
  });

  it('lets the basket be switched explicitly when several apps are present', () => {
    // Deliberately uneven, so "largest basket" is unambiguous.
    useParsedDataStore.setState({
      items: [
        { id: 's', name: 'Dosa', prices: { Swiggy: 180 }, quantity: 1, sourcePlatform: 'Swiggy' },
        { id: 'z1', name: 'Dosa', prices: { Zomato: 200 }, quantity: 1, sourcePlatform: 'Zomato' },
        { id: 'z2', name: 'Idli', prices: { Zomato: 120 }, quantity: 1, sourcePlatform: 'Zomato' },
      ],
      coupons: [],
    });

    function Probe() {
      const { basket } = usePlatformQuotes();
      return <span data-testid="basket">{basket?.platform ?? 'none'}</span>;
    }

    render(<Probe />);
    // No choice made yet, so the larger basket is priced.
    expect(screen.getByTestId('basket')).toHaveTextContent('Zomato');

    act(() => {
      useSelectedPlatformStore.setState({ sourcePlatform: 'Swiggy' });
    });
    expect(screen.getByTestId('basket')).toHaveTextContent('Swiggy');
  });
});

describe('split total consistency', () => {
  it('splits exactly the total /optimize quoted for the chosen platform', () => {
    useSelectedPlatformStore.setState({ platform: 'Swiggy' });

    render(<SplitPage />);

    expect(screen.getByText('₹636.00')).toBeInTheDocument();
    // SWIGGY50 is 50% of the 680 subtotal, capped at 120.
    expect(screen.getByText('SWIGGY50 (-₹120.00)')).toBeInTheDocument();
    expect(screen.getByText('₹30.00')).toBeInTheDocument();

    // Two people: 636 / 2 = 318.00 exactly.
    expect(screen.getByText('Person 1').nextElementSibling).toHaveTextContent('₹318.00');
    expect(screen.getByText('Person 2').nextElementSibling).toHaveTextContent('₹318.00');
  });

  it('includes delivery fee and discount in the amount being split', () => {
    useSelectedPlatformStore.setState({ platform: 'Swiggy' });

    render(<SplitPage />);

    // 680 + 46 + 30 - 120 = 636, so the fee and the discount must both show up.
    expect(screen.getByText('₹680.00')).toBeInTheDocument();
    expect(screen.getByText('₹46.00')).toBeInTheDocument();
  });

  it('divides an exact total without losing a paisa', () => {
    useSelectedPlatformStore.setState({ platform: 'Toing' });

    render(<SplitPage />);

    expect(screen.getByText('₹744.00')).toBeInTheDocument();
    expect(screen.getByText('Person 1').nextElementSibling).toHaveTextContent('₹372.00');
    expect(screen.getByText('Person 2').nextElementSibling).toHaveTextContent('₹372.00');
  });

  it('agrees with the figure shown on /optimize for the same platform', () => {
    useSelectedPlatformStore.setState({ platform: 'Zomato' });

    const { unmount } = render(<OptimizePage />);
    expect(screen.getByText('₹676.00')).toBeInTheDocument();
    unmount();

    render(<SplitPage />);
    expect(screen.getByText('₹676.00')).toBeInTheDocument();
  });

  it('prompts for a platform choice instead of guessing when none is selected', () => {
    render(<SplitPage />);

    expect(screen.getByText(/No platform selected/i)).toBeInTheDocument();
    expect(screen.queryByText('Person 1')).not.toBeInTheDocument();
  });
});

describe('DEMO_COUPONS', () => {
  it('only references known platforms and is worth something', () => {
    const platforms = new Set(['Swiggy', 'Zomato', 'Toing']);

    DEMO_COUPONS.forEach((coupon) => {
      expect(platforms.has(coupon.platform)).toBe(true);
      // Resolved against a large basket so a cap cannot mask a broken amount.
      expect(couponValue(coupon, 5000)).toBeGreaterThan(0);
    });
  });

  it('never carries both a flat amount and a percentage', () => {
    DEMO_COUPONS.forEach((coupon) => {
      const shapes = [coupon.discount !== undefined, coupon.percentOff !== undefined];
      expect(shapes.filter(Boolean)).toHaveLength(1);
    });
  });
});
