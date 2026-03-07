'use client';

import { useEffect, useState } from 'react';
import { ThemeSelector } from './ui/theme-selector';

type ThemeMode = 'dark' | 'light';

const KEY = 'sb-theme-mode';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const persistThemeMode = (mode: ThemeMode) => {
  window.localStorage.setItem(KEY, mode);
  document.cookie = `${KEY}=${mode}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function ThemeSwitcher({ initialMode }: { initialMode: ThemeMode }) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const onChange = (nextMode: ThemeMode) => {
    setMode(nextMode);
    document.documentElement.setAttribute('data-theme', nextMode);
    persistThemeMode(nextMode);
  };

  return <ThemeSelector value={mode} onChange={onChange} compact />;
}
