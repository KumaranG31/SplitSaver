import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Platform } from '@/store/useSelectedPlatformStore';
import { PLATFORMS, type Coupon } from '@/utils/optimizationEngine';

export type OrderItem = {
  id: string; // uniq identifier
  name: string;
  quantity: number;
  /**
   * Unit price in rupees for each platform, as read from that app's screenshot.
   *
   * A platform is absent when no screenshot gave a price for it. The engine then
   * falls back to a price from another platform and reports the total as an
   * estimate, so a single-app upload still yields a full comparison without
   * pretending the borrowed figure was measured.
   */
  prices: Partial<Record<Platform, number>>;
  platformFee?: number;
  tax?: number;
  sourcePlatform?: Platform;
  sourceShotId?: string;
  unattributedPrice?: number;
};

type ParsedState = {
  items: OrderItem[];
  /** Offers collected from discount screenshots or entered by hand. */
  coupons: Coupon[];
  setItems: (items: OrderItem[]) => void;
  setCoupons: (coupons: Coupon[]) => void;
  addItem: () => void;
  updateItem: (id: string, updates: Partial<OrderItem>) => void;
  updateItemPrice: (id: string, platform: Platform, price: number | undefined) => void;
  removeItem: (id: string) => void;
  clearItems: () => void;
};

let counter = 0;
const nextId = () => {
  counter += 1;
  return `manual-${counter}`;
};

const isPlatform = (value: unknown): value is Platform =>
  typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);

const optionalAmount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Rebuilds one item read back from storage.
 *
 * Storage is not type-checked, and an earlier build saved items with a single
 * price instead of one price per platform. Those rows rehydrate without a
 * `prices` object at all, which made every reader of it — the optimizer's
 * `resolvePrice`, the grid's cells — dereference `undefined`. An unreadable
 * field is dropped rather than guessed, so a missing price keeps meaning "no
 * screenshot gave one" and still costs as an estimate.
 *
 * Rows without an id are dropped, since every edit in the grid addresses a row
 * by id and such a row could never be changed.
 */
const normalizeItem = (value: unknown): OrderItem | null => {
  if (typeof value !== 'object' || value === null) return null;

  const raw = value as Partial<OrderItem>;
  if (typeof raw.id !== 'string' || raw.id === '') return null;

  const prices: Partial<Record<Platform, number>> = {};
  const storedPrices = raw.prices;
  if (typeof storedPrices === 'object' && storedPrices !== null) {
    for (const platform of PLATFORMS) {
      const price = optionalAmount(storedPrices[platform]);
      if (price !== undefined) prices[platform] = price;
    }
  }

  const item: OrderItem = {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    quantity:
      typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) && raw.quantity >= 1
        ? raw.quantity
        : 1,
    prices,
  };

  const platformFee = optionalAmount(raw.platformFee);
  if (platformFee !== undefined) item.platformFee = platformFee;
  const tax = optionalAmount(raw.tax);
  if (tax !== undefined) item.tax = tax;
  if (isPlatform(raw.sourcePlatform)) item.sourcePlatform = raw.sourcePlatform;
  if (typeof raw.sourceShotId === 'string') item.sourceShotId = raw.sourceShotId;
  const unattributedPrice = optionalAmount(raw.unattributedPrice);
  if (unattributedPrice !== undefined) item.unattributedPrice = unattributedPrice;

  return item;
};

const normalizeItems = (value: unknown): OrderItem[] =>
  Array.isArray(value)
    ? value.map(normalizeItem).filter((item): item is OrderItem => item !== null)
    : [];

export const useParsedDataStore = create<ParsedState>()(
  persist(
    (set) => ({
      items: [],
      coupons: [],
      setItems: (items) => set({ items }),
      setCoupons: (coupons) => set({ coupons }),
      addItem: () =>
        set((state) => ({
          items: [
            ...state.items,
            { id: nextId(), name: '', quantity: 1, prices: {} },
          ],
        })),
      updateItem: (id, updates) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item,
          ),
        })),
      // Prices are replaced per platform rather than merged, so clearing a cell
      // clears the price instead of leaving a stale one behind.
      updateItemPrice: (id, platform, price) =>
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== id) return item;
            const prices = { ...item.prices };
            if (price === undefined) delete prices[platform];
            else prices[platform] = price;
            return { ...item, prices };
          }),
        })),
      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clearItems: () => set({ items: [], coupons: [] }),
    }),
    {
      name: 'splitsave-parsed-data',
      // Rehydration is the one place untyped data enters the store, so it is
      // where the OrderItem invariant is enforced. Normalising here means the
      // engine and the grid can read `item.prices` as the type they declare,
      // instead of each guarding against a shape this file promises cannot exist.
      merge: (persisted, current) => {
        const stored = persisted as Partial<ParsedState> | undefined;
        return {
          ...current,
          ...stored,
          items: stored?.items === undefined ? current.items : normalizeItems(stored.items),
        };
      },
    },
  ),
);