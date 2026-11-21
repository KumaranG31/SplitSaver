"use client";
import { useThemeStore } from '@/store/useThemeStore';
import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { isDark } = useThemeStore();

  useEffect(() => {
    const classList = document.documentElement.classList;
    if (isDark) {
      classList.add('dark');
    } else {
      classList.remove('dark');
    }
  }, [isDark]);

  return <>{children}</>;
}
