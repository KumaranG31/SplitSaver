import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeState = {
  isDark: boolean;
  toggle: () => void;
};

/**
 * Persisted preference only. The `.dark` class is applied by `ThemeProvider`,
 * so the store stays free of DOM side effects and remains testable.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: true,
      toggle: () => set({ isDark: !get().isDark }),
    }),
    { name: 'splitsave-theme' },
  ),
);
