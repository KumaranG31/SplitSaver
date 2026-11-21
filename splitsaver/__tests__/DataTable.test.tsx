import { fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable } from '@/components/DataTable';
import { useParsedDataStore, type OrderItem } from '@/store/useParsedDataStore';

/**
 * Item prices come from screenshots of different apps, so no single item knows
 * every price. `a` was priced on Swiggy, `b` on Zomato, which means each platform
 * has to borrow the other's price for one item.
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
  { id: 'b', name: 'Masala Dosa', prices: { Zomato: 180 }, quantity: 1, sourcePlatform: 'Zomato' },
];

beforeEach(() => {
  localStorage.clear();
  useParsedDataStore.setState({ items });
});

describe('DataTable', () => {
  it('renders a row per item with an editable quantity', () => {
    render(<DataTable />);

    expect(screen.getByDisplayValue('Paneer Tikka')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Masala Dosa')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity for item a')).toHaveValue(2);
  });

  it('writes name edits back to the store', () => {
    render(<DataTable />);

    fireEvent.change(screen.getByDisplayValue('Paneer Tikka'), {
      target: { value: 'Special Paneer' },
    });

    expect(useParsedDataStore.getState().items[0].name).toBe('Special Paneer');
  });

  it('writes a platform price edit back to the store as a number', () => {
    render(<DataTable />);

    fireEvent.change(screen.getByLabelText('Zomato price for item a'), {
      target: { value: '275' },
    });

    expect(useParsedDataStore.getState().items[0].prices.Zomato).toBe(275);
  });

  it('edits one platform price without disturbing the others', () => {
    render(<DataTable />);

    fireEvent.change(screen.getByLabelText('Zomato price for item a'), {
      target: { value: '275' },
    });

    expect(useParsedDataStore.getState().items[0].prices).toEqual({ Swiggy: 250, Zomato: 275 });
  });

  it('stores an emptied price as missing rather than as a zero', () => {
    render(<DataTable />);

    fireEvent.change(screen.getByLabelText('Swiggy price for item a'), { target: { value: '' } });

    const { prices } = useParsedDataStore.getState().items[0];
    expect(prices.Swiggy).toBeUndefined();
    expect('Swiggy' in prices).toBe(false);
  });

  it('keeps a price of zero, because a free item is a real price', () => {
    render(<DataTable />);

    fireEvent.change(screen.getByLabelText('Swiggy price for item b'), { target: { value: '0' } });

    expect(useParsedDataStore.getState().items[1].prices.Swiggy).toBe(0);
  });

  it('marks a price it had to borrow with a dash instead of a value', () => {
    render(<DataTable />);

    const borrowed = screen.getByLabelText('Swiggy price for item b');
    expect(borrowed).toHaveValue(null);
    expect(borrowed).toHaveAttribute('placeholder', '—');

    const measured = screen.getByLabelText('Swiggy price for item a');
    expect(measured).not.toHaveAttribute('placeholder');
  });

  it('clears a fee back to zero when its field is emptied', () => {
    render(<DataTable />);

    fireEvent.change(screen.getByLabelText('Platform fee for item a'), { target: { value: '' } });

    expect(useParsedDataStore.getState().items[0].platformFee).toBe(0);
  });

  it('removes the row whose delete button is pressed', () => {
    render(<DataTable />);

    fireEvent.click(screen.getByLabelText('Remove Paneer Tikka'));

    expect(useParsedDataStore.getState().items.map((i) => i.id)).toEqual(['b']);
  });

  it('appends a blank row', () => {
    render(<DataTable />);

    fireEvent.click(screen.getByRole('button', { name: /add row/i }));

    expect(useParsedDataStore.getState().items).toHaveLength(3);
  });

  it('shows a subtotal for every platform, including borrowed prices', () => {
    render(<DataTable />);

    //   Swiggy  250*2 (measured) + 180*1 (borrowed from Zomato) = 680
    //   Zomato  250*2 (borrowed from Swiggy) + 180*1 (measured) = 680
    //   Toing   same two prices, both borrowed                 = 680
    const subtotals = screen.getAllByText('₹680.00');
    expect(subtotals).toHaveLength(3);
  });

  it('shows scaled fees and tax once, since they are not platform specific', () => {
    render(<DataTable />);

    // Fees and tax are per-unit, so they scale with quantity like price does:
    //   fees 5*2 = 10, tax 18*2 = 36
    expect(screen.getAllByText('₹10.00')).toHaveLength(1);
    expect(screen.getAllByText('₹36.00')).toHaveLength(1);
  });

  it('explains that an empty price cell is costed from another app', () => {
    render(<DataTable />);

    expect(
      screen.getByText(/no screenshot supplied that price/i),
    ).toBeInTheDocument();
    const totalRow = screen.getByText('Subtotal').closest('tr') as HTMLElement;
    expect(within(totalRow)).toBeTruthy();
  });
});