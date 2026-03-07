'use client';

import { useState } from 'react';
import { SensitiveToggle } from './ui/sensitive-toggle';
import { ThemeSelector } from './ui/theme-selector';

type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'sb-theme-mode';
const SENSITIVE_KEY = 'sb-sensitive-hidden';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const persistCookie = (key: string, value: string) => {
  document.cookie = `${key}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function LayoutControls({
  initialSensitiveHidden,
  initialTheme,
}: {
  initialSensitiveHidden: boolean;
  initialTheme: ThemeMode;
}) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [isSensitiveHidden, setIsSensitiveHidden] = useState(
    initialSensitiveHidden,
  );

  const updateTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    window.localStorage.setItem(THEME_KEY, nextTheme);
    persistCookie(THEME_KEY, nextTheme);
  };

  const updateSensitiveMode = (nextHidden: boolean) => {
    setIsSensitiveHidden(nextHidden);
    document.documentElement.setAttribute(
      'data-sensitive',
      nextHidden ? 'hidden' : 'visible',
    );
    window.localStorage.setItem(SENSITIVE_KEY, nextHidden ? '1' : '0');
    persistCookie(SENSITIVE_KEY, nextHidden ? '1' : '0');
  };

  return (
    <div className="flex items-center gap-2">
      <SensitiveToggle
        value={isSensitiveHidden}
        onChange={updateSensitiveMode}
        compact
      />
      <ThemeSelector value={theme} onChange={updateTheme} compact />
    </div>
  );
}
