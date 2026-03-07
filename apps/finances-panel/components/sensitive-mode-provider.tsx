'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

type SensitiveModeContextValue = {
  isSensitiveHidden: boolean;
  setSensitiveHidden: (hidden: boolean) => void;
};

const SensitiveModeContext = createContext<SensitiveModeContextValue | null>(
  null,
);

const KEY = 'sb-sensitive-hidden';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const applySensitiveAttribute = (hidden: boolean) => {
  document.documentElement.setAttribute(
    'data-sensitive',
    hidden ? 'hidden' : 'visible',
  );
};

const persistSensitiveMode = (hidden: boolean) => {
  window.localStorage.setItem(KEY, hidden ? '1' : '0');
  document.cookie = `${KEY}=${hidden ? '1' : '0'}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function SensitiveModeProvider({
  children,
  initialHidden,
}: {
  children: ReactNode;
  initialHidden: boolean;
}) {
  const [isSensitiveHidden, setIsSensitiveHiddenState] =
    useState(initialHidden);

  const setSensitiveHidden = useCallback((hidden: boolean) => {
    setIsSensitiveHiddenState(hidden);
    applySensitiveAttribute(hidden);
    persistSensitiveMode(hidden);
  }, []);

  const value = useMemo(
    () => ({ isSensitiveHidden, setSensitiveHidden }),
    [isSensitiveHidden, setSensitiveHidden],
  );

  return (
    <SensitiveModeContext.Provider value={value}>
      {children}
    </SensitiveModeContext.Provider>
  );
}

export const useSensitiveMode = () => {
  const value = useContext(SensitiveModeContext);
  if (!value) {
    throw new Error(
      'useSensitiveMode must be used inside SensitiveModeProvider',
    );
  }
  return value;
};
