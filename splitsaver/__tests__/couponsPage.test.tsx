import type { ReactElement, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import CouponsPage from '@/app/coupons/page';
import { useOCR } from '@/hooks/useOCR';
import { useCouponUploadStore, useUploadStore } from '@/store/useUploadStore';
import { useParsedDataStore } from '@/store/useParsedDataStore';

jest.mock('next/link', () => {
  // requireActual, not a top-level import: jest.mock is hoisted above imports,
  // so the factory may only reach for React lazily.
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: ReactNode }) =>
      createElement('a', { href: '/', ...props }, children),
  };
});

jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('framer-motion', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const stub = (tag: string) => {
    const Stub = ({ children }: { children?: ReactNode }) =>
      createElement(tag, null, children);
    Stub.displayName = `Motion${tag}`;
    return Stub;
  };
  return { motion: { div: stub('div') } };
});

// Tesseract is exercised separately; here it is replaced by a scriptable stub so
// the page's own state handling can be driven deterministically.
const recognize = jest.fn();

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(async () => ({
    recognize: (...args: unknown[]) => recognize(...args),
    terminate: jest.fn(async () => undefined),
  })),
}));

jest.mock('@/hooks/useOCR', () => ({
  useOCR: jest.fn(),
}));

const file = (name: string) => new File(['x'], name, { type: 'image/png' });

// jsdom ships no object-URL support, and the page only needs something to hand
// to next/image for a preview thumbnail.
beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
});

const renderAsync = async (ui: ReactElement) => {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
  });
  return result;
};

const swiggyOffer = { data: { text: 'Swiggy offer\nCoupon SWIGGY50\n50% off up to 120' } };
const zomatoOffer = { data: { text: 'Zomato offer\nCoupon ZOMATO75\n75% off' } };

beforeEach(() => {
  localStorage.clear();
  recognize.mockReset();
  useUploadStore.setState({ files: [] });
  useCouponUploadStore.setState({ files: [] });
  useParsedDataStore.setState({
    items: [
      {
        id: 'a',
        name: 'Paneer Tikka',
        prices: { Swiggy: 250, Zomato: 280, Toing: 220 },
        quantity: 2,
      },
    ],
    coupons: [],
  });
  (useOCR as jest.Mock).mockReturnValue({
    files: [],
    progress: 0,
    error: null,
    isRecognizing: false,
  });
});

describe('CouponsPage', () => {
  it('tells the user to confirm an order first when there is none', async () => {
    useParsedDataStore.setState({ items: [] });

    await renderAsync(<CouponsPage />);

    expect(screen.getByText(/no order confirmed yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cheapest/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('reads an offer from a screenshot and records which app it belongs to', async () => {
    useCouponUploadStore.setState({ files: [file('swiggy.png')] });
    recognize.mockResolvedValue(swiggyOffer);
    (useOCR as jest.Mock).mockReturnValue({
      files: [{ file: file('swiggy.png'), fileName: 'swiggy.png', text: swiggyOffer.data.text }],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);

    await waitFor(() =>
      expect(useParsedDataStore.getState().coupons).toEqual([
        expect.objectContaining({ code: 'SWIGGY50', platform: 'Swiggy' }),
      ]),
    );
  });

  it('keeps coupons from different apps apart', async () => {
    useCouponUploadStore.setState({ files: [file('swiggy.png'), file('zomato.png')] });
    recognize.mockResolvedValue(swiggyOffer);
    (useOCR as jest.Mock).mockReturnValue({
      files: [
        { file: file('swiggy.png'), fileName: 'swiggy.png', text: swiggyOffer.data.text },
        { file: file('zomato.png'), fileName: 'zomato.png', text: zomatoOffer.data.text },
      ],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);

    await waitFor(() => expect(useParsedDataStore.getState().coupons).toHaveLength(2));
    const { coupons } = useParsedDataStore.getState();
    expect(coupons.map((c) => c.code).sort()).toEqual(['SWIGGY50', 'ZOMATO75']);
    expect(coupons.map((c) => c.platform).sort()).toEqual(['Swiggy', 'Zomato']);
  });

  it('keeps the same code from two accounts as two separate offers', async () => {
    useCouponUploadStore.setState({ files: [file('personal.png'), file('work.png')] });
    recognize.mockResolvedValue(swiggyOffer);
    (useOCR as jest.Mock).mockReturnValue({
      files: [
        { file: file('personal.png'), fileName: 'personal.png', text: swiggyOffer.data.text },
        { file: file('work.png'), fileName: 'work.png', text: swiggyOffer.data.text },
      ],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);

    await waitFor(() => expect(useParsedDataStore.getState().coupons).toHaveLength(2));

    fireEvent.change(screen.getByLabelText('Account for personal.png'), {
      target: { value: 'personal' },
    });
    fireEvent.change(screen.getByLabelText('Account for work.png'), {
      target: { value: 'work' },
    });

    await waitFor(() =>
      expect(useParsedDataStore.getState().coupons.map((c) => c.accountLabel).sort()).toEqual([
        'personal',
        'work',
      ]),
    );
  });

  it('does not apply an offer to an app it was not issued by', async () => {
    useCouponUploadStore.setState({ files: [file('swiggy.png')] });
    (useOCR as jest.Mock).mockReturnValue({
      files: [{ file: file('swiggy.png'), fileName: 'swiggy.png', text: swiggyOffer.data.text }],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);
    await waitFor(() => expect(screen.getByLabelText('App for swiggy.png')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('App for swiggy.png'), { target: { value: 'Toing' } });

    await waitFor(() =>
      expect(useParsedDataStore.getState().coupons[0]).toMatchObject({
        code: 'SWIGGY50',
        platform: 'Toing',
      }),
    );
  });

  it('shows what an offer is worth on the order actually being placed', async () => {
    // Paneer Tikka x2 on Swiggy costs 500, so a 50% offer capped at 120 is worth 120.
    useCouponUploadStore.setState({ files: [file('swiggy.png')] });
    (useOCR as jest.Mock).mockReturnValue({
      files: [{ file: file('swiggy.png'), fileName: 'swiggy.png', text: swiggyOffer.data.text }],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);

    await waitFor(() => expect(screen.getByText('₹120.00')).toBeInTheDocument());
    expect(screen.getByText(/50% off/)).toBeInTheDocument();
  });

  it('explains an offer the order is too small for, instead of pricing it at zero', async () => {
    useCouponUploadStore.setState({ files: [file('zomato.png')] });
    (useOCR as jest.Mock).mockReturnValue({
      files: [{ file: file('zomato.png'), fileName: 'zomato.png', text: 'Zomato offer\nCoupon ZBIG1\nflat 200 off on orders above 1000' }],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);

    await waitFor(() => expect(screen.getByText(/needs ₹1000\.00/)).toBeInTheDocument());
  });

  it('warns when a screenshot could not be matched to an app', async () => {
    useCouponUploadStore.setState({ files: [file('anon.png')] });
    (useOCR as jest.Mock).mockReturnValue({
      files: [{ file: file('anon.png'), fileName: 'anon.png', text: 'offer\nCoupon MYCODE1\n50% off' }],
      progress: 100,
      error: null,
      isRecognizing: false,
    });

    await renderAsync(<CouponsPage />);

    await waitFor(() => expect(screen.getByText(/could not be\s+matched to an app/i)).toBeInTheDocument());
    // Nothing is invented for an app we do not know.
    expect(useParsedDataStore.getState().coupons).toEqual([]);
  });
});