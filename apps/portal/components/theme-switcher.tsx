'use client';

import { useEffect, useState } from 'react';
import { ThemeSelector } from './ui';

type ThemeMode = 'dark' | 'light';

const KEY = 'sb-theme-mode';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const persistThemeMode = (mode: ThemeMode) => {
  window.localStorage.setItem(KEY, mode);
  document.cookie = `${KEY}=${mode}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const raw = window.localStorage.getItem(KEY);
    const next: ThemeMode = raw === 'light' ? 'light' : 'dark';
    setMode(next);
    document.documentElement.setAttribute('data-theme', next);
  }, []);

  const onChange = (nextMode: ThemeMode) => {
    setMode(nextMode);
    document.documentElement.setAttribute('data-theme', nextMode);
    persistThemeMode(nextMode);
  };

  return <ThemeSelector value={mode} onChange={onChange} compact />;
}
