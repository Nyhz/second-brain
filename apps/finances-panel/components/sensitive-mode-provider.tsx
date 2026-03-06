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

type SensitiveModeContextValue = {
  isSensitiveHidden: boolean;
  setSensitiveHidden: (hidden: boolean) => void;
};

const SensitiveModeContext = createContext<SensitiveModeContextValue | null>(
  null,
);

const KEY = 'sb-sensitive-hidden';

const applySensitiveAttribute = (hidden: boolean) => {
  document.documentElement.setAttribute(
    'data-sensitive',
    hidden ? 'hidden' : 'visible',
  );
};

export function SensitiveModeProvider({ children }: { children: ReactNode }) {
  const [isSensitiveHidden, setIsSensitiveHiddenState] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(KEY);
    const hidden = raw === '1';
    setIsSensitiveHiddenState(hidden);
    applySensitiveAttribute(hidden);
  }, []);

  const setSensitiveHidden = useCallback((hidden: boolean) => {
    setIsSensitiveHiddenState(hidden);
    applySensitiveAttribute(hidden);
    window.localStorage.setItem(KEY, hidden ? '1' : '0');
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
