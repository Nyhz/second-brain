'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ThemeMode = 'dark' | 'light';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const KEY = 'sb-theme-mode';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const persistThemeMode = (mode: ThemeMode) => {
  window.localStorage.setItem(KEY, mode);
  document.cookie = `${KEY}=${mode}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function ThemeProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  initialMode: ThemeMode;
}) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
  }, [mode]);

  const setThemeMode = useCallback((nextMode: ThemeMode) => {
    setMode(nextMode);
    document.documentElement.setAttribute('data-theme', nextMode);
    persistThemeMode(nextMode);
  }, []);

  const value = useMemo(
    () => ({ mode, setMode: setThemeMode }),
    [mode, setThemeMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useThemeMode = () => {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useThemeMode must be used inside ThemeProvider');
  }
  return value;
};
