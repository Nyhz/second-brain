'use client';

import { ThemeToggle } from '@second-brain/ui';
import { useState } from 'react';

type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'sb-theme-mode';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const persistCookie = (key: string, value: string) => {
  document.cookie = `${key}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function LayoutControls({
  initialTheme,
}: {
  initialTheme: ThemeMode;
}) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);

  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.localStorage.setItem(THEME_KEY, nextTheme);
    persistCookie(THEME_KEY, nextTheme);
  };

  return (
    <ThemeToggle value={theme} onChange={updateTheme} compact />
  );
}
