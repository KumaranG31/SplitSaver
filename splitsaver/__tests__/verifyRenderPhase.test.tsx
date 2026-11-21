import type { ReactElement, ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useUploadStore } from '@/store/useUploadStore';
import { useParsedDataStore } from '@/store/useParsedDataStore';

/**
 * Regression guard for a setState-during-render bug in the app-attribution UI.
 *
 * Correcting a screenshot's app used to write to the parsed-data store from
 * inside a `setScreenshots` updater. React runs updaters during render, so the
 * page updated another store mid-render and logged:
 *
 *   Cannot update a component (`VerifyPage`) while rendering a different
 *   component (`VerifyPage`).
 *
 * This lives in its own file on purpose. React emits that warning only once per
 * component, so a test sharing a file with any other test that reassigns an app
 * would find the warning already consumed and pass against the bug.
 */

jest.mock('next/link', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
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

const recognize = jest.fn();

jest.mock('tesseract.js', () => ({
  PSM: { SPARSE_TEXT: '11' },
  createWorker: jest.fn(async () => ({
    recognize: (...args: unknown[]) => recognize(...args),
    setParameters: jest.fn(async () => undefined),
    terminate: jest.fn(async () => undefined),
  })),
}));

const file = (name: string) => new File(['x'], name, { type: 'image/png' });

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
  localStorage.clear();
  useUploadStore.setState({ files: [] });
  useParsedDataStore.setState({ items: [], coupons: [] });
});

it('does not write to another store while rendering', async () => {
  const logged: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(' '));
  });

  try {
    useUploadStore.setState({ files: [file('swiggy.png')] });
    recognize.mockResolvedValue({ data: { text: 'Swiggy\nPaneer Tikka 250' } });

    await renderAsync(<VerifyPage />);
    await waitFor(() => expect(useParsedDataStore.getState().items).toHaveLength(1));

    fireEvent.change(screen.getByLabelText(/delivery app for swiggy\.png/i), {
      target: { value: 'Zomato' },
    });
    await waitFor(() =>
      expect(useParsedDataStore.getState().items[0]?.sourcePlatform).toBe('Zomato'),
    );

    expect(logged.filter((line) => /Cannot update a component/.test(line))).toEqual([]);
  } finally {
    spy.mockRestore();
  }
});