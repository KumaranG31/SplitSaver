"use client";

import { useThemeStore } from '@/store/useThemeStore';
import { Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

export const DarkModeToggle = () => {
  const { isDark, toggle } = useThemeStore();

  return (
    <button
      type="button"
      onClick={toggle}
      className="glass rounded-full p-2 transition-colors hover:bg-surface-hover"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
    >
      <motion.span
        key={isDark ? 'dark' : 'light'}
        initial={{ rotate: -180, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="block"
      >
        {isDark ? <Moon size={20} /> : <Sun size={20} />}
      </motion.span>
    </button>
  );
};
