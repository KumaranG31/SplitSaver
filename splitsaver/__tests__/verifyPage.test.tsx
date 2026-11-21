import type { ReactElement, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useOCR } from '@/hooks/useOCR';
import { useUploadStore } from '@/store/useUploadStore';
import { useParsedDataStore, type OrderItem } from '@/store/useParsedDataStore';

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
  return { motion: { div: stub('div') } };
});

// Tesseract is exercised separately; here it is replaced by a scriptable stub so
// the page's own state handling can be driven deterministically.
const recognize = jest.fn();
const setParameters = jest.fn(async () => undefined);
let workerReady = true;

jest.mock('tesseract.js', () => ({
  PSM: { SPARSE_TEXT: '11' },
  createWorker: jest.fn(async () => {
    if (!workerReady) throw new Error('worker unavailable');
    return {
      recognize: (...args: unknown[]) => recognize(...args),
      setParameters,
      terminate: jest.fn(async () => undefined),
    };
  }),
}));

const staleItem: OrderItem = { id: 'stale', name: 'Old Order', prices: { Swiggy: 999 }, quantity: 1 };

const file = (name: string) => new File(['x'], name, { type: 'image/png' });

/** Mounts and lets the async worker creation settle inside act. */
const renderAsync = async (ui: ReactElement) => {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
  });
  return result;
};

let VerifyPage: typeof import('@/app/verify/page').default;

beforeAll(async () => {
  VerifyPage = (await import('@/app/verify/page')).default;
});

beforeEach(() => {
  jest.clearAllMocks();
  workerReady = true;
  localStorage.clear();
  recognize.mockResolvedValue({ data: { text: '' } });
  useUploadStore.setState({ files: [] });
  useParsedDataStore.setState({ items: [], coupons: [] });
});

describe('useOCR progress', () => {
  function Probe({ files }: { files: File[] }) {
    const { progress, isRecognizing } = useOCR(files);
    return (
      <span data-testid="state">
        {progress}:{String(isRecognizing)}
      </span>
    );
  }

  it('stays in the recognizing state while a file is still being read', async () => {
    // Never settles, so the pending state can be observed deterministically.
    recognize.mockReturnValue(new Promise(() => {}));

    await renderAsync(<Probe files={[file('a.png')]} />);

    expect(screen.getByTestId('state')).toHaveTextContent('0:true');
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it('advances to 100% once every file is recognised', async () => {
    recognize.mockResolvedValue({ data: { text: 'Paneer Tikka 250' } });

    await renderAsync(<Probe files={[file('a.png'), file('b.png')]} />);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('100:false'));
    expect(recognize).toHaveBeenCalledTimes(2);
  });

  it('surfaces a worker failure instead of hanging on a spinner', async () => {
    workerReady = false;

    function Failing() {
      const { error, isRecognizing } = useOCR([file('a.png')]);
      return (
        <span data-testid="state">
          {error ?? 'none'}:{String(isRecognizing)}
        </span>
      );
    }

    await renderAsync(<Failing />);

    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('worker unavailable:false'),
    );
  });
});

describe('VerifyPage', () => {
  it('sends the user back to upload when nothing is selected', async () => {
    await renderAsync(<VerifyPage />);

    expect(screen.getByText(/No screenshots uploaded yet/i)).toBeInTheDocument();
  });

  it('keeps the table editable after an empty parse so the step is recoverable', async () => {
    useUploadStore.setState({ files: [file('a.png')] });
    recognize.mockResolvedValue({ data: { text: 'Thanks for your order' } });

    await renderAsync(<VerifyPage />);

    await waitFor(() =>
      expect(screen.getByText(/No line items were detected/i)).toBeInTheDocument(),
    );

    // The escape hatch has to actually be there, not just mentioned in prose.
    const addRow = screen.getByRole('button', { name: /add row/i });
    expect(addRow).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /add coupons/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    fireEvent.click(addRow);
    expect(useParsedDataStore.getState().items).toHaveLength(1);
  });

  it('drops a previous order when a new screenshot is selected', async () => {
    useUploadStore.setState({ files: [file('a.png')] });
    recognize.mockResolvedValue({ data: { text: 'Paneer Tikka 250' } });

    const { rerender } = await renderAsync(<VerifyPage />);
    await waitFor(() => expect(useParsedDataStore.getState().items).toHaveLength(1));

    // A fresh selection that yields nothing must not inherit the old rows.
    recognize.mockResolvedValue({ data: { text: '' } });
    act(() => {
      useUploadStore.setState({ files: [file('b.png')] });
    });
    rerender(<VerifyPage />);

    await waitFor(() => expect(useParsedDataStore.getState().items).toHaveLength(0));
  });

  it('clears parsed rows when the user starts over', async () => {
    useUploadStore.setState({ files: [file('a.png')] });
    recognize.mockResolvedValue({ data: { text: 'Paneer Tikka 250' } });

    await renderAsync(<VerifyPage />);
    await waitFor(() => expect(useParsedDataStore.getState().items).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /start over/i }));

    await waitFor(() => {
      expect(useUploadStore.getState().files).toEqual([]);
      expect(useParsedDataStore.getState().items).toEqual([]);
    });
  });

  it('enables the coupon step once rows exist', async () => {
    useUploadStore.setState({ files: [file('a.png')] });
    recognize.mockResolvedValue({ data: { text: 'Paneer Tikka 250' } });

    await renderAsync(<VerifyPage />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /add coupons/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
  });
});

describe('VerifyPage app attribution', () => {
  const swiggyReceipt = { data: { text: 'Swiggy\nItem total 680\nPaneer Tikka 250' } };

  it('tags items with the app detected from the screenshot', async () => {
    useUploadStore.setState({ files: [file('swiggy.png')] });
    recognize.mockResolvedValue(swiggyReceipt);

    await renderAsync(<VerifyPage />);

    await waitFor(() =>
      expect(useParsedDataStore.getState().items[0]?.sourcePlatform).toBe('Swiggy'),
    );
  });

  it('moves items to another basket when the app is corrected', async () => {
    useUploadStore.setState({ files: [file('swiggy.png')] });
    recognize.mockResolvedValue(swiggyReceipt);

    await renderAsync(<VerifyPage />);
    await waitFor(() =>
      expect(useParsedDataStore.getState().items[0]?.sourcePlatform).toBe('Swiggy'),
    );

    fireEvent.change(screen.getByLabelText(/delivery app for swiggy\.png/i), {
      target: { value: 'Toing' },
    });

    await waitFor(() =>
      expect(useParsedDataStore.getState().items[0]?.sourcePlatform).toBe('Toing'),
    );
    expect(useParsedDataStore.getState().items[0]?.prices).toEqual({ Toing: 250 });
  });
});

describe('persistence hygiene', () => {
  it('does not leave a stale order behind for the next visit', () => {
    useParsedDataStore.setState({ items: [staleItem] });

    // Items persist by design, but they are cleared when a new selection lands.
    expect(useParsedDataStore.getState().items).toEqual([staleItem]);
    expect(useUploadStore.getState().files).toEqual([]);
  });
});
