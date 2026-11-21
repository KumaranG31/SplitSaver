import { useParsedDataStore, type OrderItem } from '@/store/useParsedDataStore';
import { useUploadStore } from '@/store/useUploadStore';
import { computeBestPlatform } from '@/utils/optimizationEngine';

const makeItem = (over: Partial<OrderItem> = {}): OrderItem => ({
  id: 'seed',
  name: 'Burger',
  prices: { Swiggy: 100, Zomato: 100, Toing: 100 },
  quantity: 1,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  useParsedDataStore.setState({ items: [] });
  useUploadStore.setState({ files: [] });
});

describe('useParsedDataStore', () => {
  it('replaces all items with setItems', () => {
    useParsedDataStore.getState().setItems([makeItem({ id: 'a' }), makeItem({ id: 'b' })]);
    expect(useParsedDataStore.getState().items).toHaveLength(2);
  });

  it('merges updates into the matching item only', () => {
    useParsedDataStore
      .getState()
      .setItems([makeItem({ id: 'a' }), makeItem({ id: 'b', prices: { Swiggy: 20 } })]);

    useParsedDataStore.getState().updateItem('a', { name: 'Renamed' });

    const { items } = useParsedDataStore.getState();
    expect(items[0]).toMatchObject({ id: 'a', name: 'Renamed' });
    expect(items[1]).toMatchObject({ id: 'b', name: 'Burger' });
  });

    it('leaves items untouched when the id does not match', () => {
    useParsedDataStore.getState().setItems([makeItem({ id: 'a' })]);

    useParsedDataStore.getState().updateItem('missing', { name: 'Renamed' });

    expect(useParsedDataStore.getState().items[0].name).toBe('Burger');
  });

  it('writes a price for one platform without disturbing the others', () => {
    useParsedDataStore.getState().setItems([makeItem({ id: 'a' })]);

    useParsedDataStore.getState().updateItemPrice('a', 'Zomato', 55);

    expect(useParsedDataStore.getState().items[0].prices).toEqual({
      Swiggy: 100,
      Zomato: 55,
      Toing: 100,
    });
  });

  it('clears a price when the cell is emptied, rather than storing zero', () => {
    useParsedDataStore.getState().setItems([makeItem({ id: 'a' })]);

    useParsedDataStore.getState().updateItemPrice('a', 'Zomato', undefined);

    expect(useParsedDataStore.getState().items[0].prices.Zomato).toBeUndefined();
    expect('Zomato' in useParsedDataStore.getState().items[0].prices).toBe(false);
  });

  it('appends a blank row with a unique id', () => {
    const { addItem } = useParsedDataStore.getState();
    addItem();
    addItem();

    const { items } = useParsedDataStore.getState();
    expect(items).toHaveLength(2);
    expect(items[0].id).not.toBe(items[1].id);
    expect(items[0]).toMatchObject({ name: '', quantity: 1, prices: {} });
  });

  it('removes only the targeted item', () => {
    useParsedDataStore.getState().setItems([makeItem({ id: 'a' }), makeItem({ id: 'b' })]);
    useParsedDataStore.getState().removeItem('a');

    expect(useParsedDataStore.getState().items.map((i) => i.id)).toEqual(['b']);
  });

  it('clears every item', () => {
    useParsedDataStore.getState().setItems([makeItem()]);
    useParsedDataStore.getState().clearItems();

    expect(useParsedDataStore.getState().items).toEqual([]);
  });

  it('persists items as JSON', () => {
    useParsedDataStore.getState().setItems([makeItem({ id: 'a', prices: { Swiggy: 42 } })]);

    const raw = localStorage.getItem('splitsave-parsed-data');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state.items[0].prices.Swiggy).toBe(42);
  });
});

describe('rehydrating an order saved by an older build', () => {
  const flushHydration = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** Loads the store again against a seeded localStorage payload. */
  const rehydrate = async (state: unknown) => {
    localStorage.setItem('splitsave-parsed-data', JSON.stringify({ state, version: 0 }));
    jest.resetModules();
    const fresh = await import('@/store/useParsedDataStore');
    await flushHydration();
    return fresh.useParsedDataStore;
  };

  it('gives a row saved without per-app prices a prices object', async () => {
    const store = await rehydrate({
      items: [{ id: 'a', name: 'Masala Dosa', quantity: 1, price: 250 }],
    });

    expect(store.getState().items[0].prices).toEqual({});
  });

  it('costs the order instead of crashing on a row that has no prices', async () => {
    const store = await rehydrate({
      items: [{ id: 'a', name: 'Masala Dosa', quantity: 1 }],
    });

    const { items } = store.getState();
    const results = computeBestPlatform(items);

    expect(results).toHaveLength(3);
    // Nothing was measured, so every platform is an estimate rather than a total.
    expect(results.every((result) => result.estimated)).toBe(true);
  });

  it('does not guess which app an unreadable single price belonged to', async () => {
    const store = await rehydrate({
      items: [{ id: 'a', name: 'Dosa', quantity: 1, price: 250, sourcePlatform: 'Swiggy' }],
    });

    // Attributing the old scalar price to `sourcePlatform` would report a
    // borrowed figure as a measured one, so the row is left unpriced and the
    // grid shows the user which cells need filling in.
    expect(store.getState().items[0].prices.Swiggy).toBeUndefined();
    expect(store.getState().items[0].sourcePlatform).toBe('Swiggy');
  });

  it('keeps the prices it can read and drops the ones it cannot', async () => {
    const store = await rehydrate({
      items: [
        {
          id: 'a',
          name: 'Dosa',
          quantity: 2,
          prices: { Swiggy: 120, Zomato: '140', Toing: null, Unknown: 999 },
        },
      ],
    });

    expect(store.getState().items[0].prices).toEqual({ Swiggy: 120 });
  });

  it('repairs rows whose quantity and app are unreadable', async () => {
    const store = await rehydrate({
      items: [{ id: 'a', name: 'Dosa', quantity: 0, prices: {}, sourcePlatform: 'Eatsome' }],
    });

    expect(store.getState().items[0]).toMatchObject({ quantity: 1 });
    expect(store.getState().items[0].sourcePlatform).toBeUndefined();
  });

  it('drops rows that could never be edited, since they have no id', async () => {
    const store = await rehydrate({
      items: [{ name: 'Dosa', quantity: 1, prices: {} }, null, 'nonsense', { id: 'a', prices: {} }],
    });

    expect(store.getState().items.map((item) => item.id)).toEqual(['a']);
  });

  it('survives a payload that is not an object at all', async () => {
    const store = await rehydrate(undefined);

    expect(store.getState().items).toEqual([]);
  });
});

describe('useUploadStore', () => {
  const makeFile = (name: string) => new File(['x'], name, { type: 'image/png' });

  it('appends files rather than replacing them', () => {
    const { addFiles } = useUploadStore.getState();
    addFiles([makeFile('a.png')]);
    addFiles([makeFile('b.png')]);

    expect(useUploadStore.getState().files.map((f) => f.name)).toEqual(['a.png', 'b.png']);
  });

  it('removes by index', () => {
    useUploadStore.getState().addFiles([makeFile('a.png'), makeFile('b.png')]);
    useUploadStore.getState().removeFile(0);

    expect(useUploadStore.getState().files.map((f) => f.name)).toEqual(['b.png']);
  });

  it('does not persist File objects, which JSON-serialise to {}', () => {
    useUploadStore.getState().addFiles([makeFile('a.png')]);

    expect(localStorage.getItem('splitsave-upload')).toBeNull();
  });
});
