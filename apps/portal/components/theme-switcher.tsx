'use client';

import { useEffect, useState } from 'react';
import { ThemeSelector } from './ui';

type ThemeMode = 'dark' | 'light';

const KEY = 'sb-theme-mode';

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
    window.localStorage.setItem(KEY, nextMode);
  };

  return <ThemeSelector value={mode} onChange={onChange} compact />;
}
