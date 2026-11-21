import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Platform = 'Swiggy' | 'Zomato' | 'Toing';

type SelectedState = {
  /**
   * The platform the user intends to order from, and therefore the quote that
   * gets divided on `/split`.
   */
  platform: Platform | null;
  /**
   * Which app's basket is being compared, when the screenshots come from more
   * than one app.
   *
   * Deliberately separate from `platform`: pressing "Select" on `/optimize`
   * means "I will order from here", which must not silently change *which*
   * uploaded order is being priced. A stale value is safe, because basket
   * selection falls back when this names an app with no items.
   */
  sourcePlatform: Platform | null;
  setPlatform: (p: Platform) => void;
  setSourcePlatform: (p: Platform | null) => void;
};

export const useSelectedPlatformStore = create<SelectedState>()(
  persist(
    (set) => ({
      platform: null,
      sourcePlatform: null,
      setPlatform: (p) => set({ platform: p }),
      setSourcePlatform: (p) => set({ sourcePlatform: p }),
    }),
    { name: 'splitsave-selected-platform' },
  ),
);