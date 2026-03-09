'use client';

import { Eye, EyeOff } from 'lucide-react';
import { PlatformIconButton } from '@second-brain/ui';
import { useState } from 'react';
import { cn } from '../lib/utils';

const SENSITIVE_KEY = 'sb-sensitive-hidden';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const persistCookie = (key: string, value: string) => {
  document.cookie = `${key}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
};

export function SensitiveControls({
  initialSensitiveHidden,
}: {
  initialSensitiveHidden: boolean;
}) {
  const [isSensitiveHidden, setIsSensitiveHidden] = useState(
    initialSensitiveHidden,
  );

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
    <PlatformIconButton
      pressed={isSensitiveHidden}
      label={
        isSensitiveHidden
          ? 'Show sensitive financial values'
          : 'Hide sensitive financial values'
      }
      onClick={() => updateSensitiveMode(!isSensitiveHidden)}
    >
      <span className="sr-only">
        Sensitive values are {isSensitiveHidden ? 'hidden' : 'visible'}.
      </span>
      <span aria-hidden="true" className="relative h-4 w-4">
        <Eye
          className={cn(
            'absolute inset-0 h-4 w-4 transition-all duration-300 ease-out',
            isSensitiveHidden
              ? 'rotate-90 scale-50 opacity-0'
              : 'rotate-0 scale-100 opacity-100',
          )}
        />
        <EyeOff
          className={cn(
            'absolute inset-0 h-4 w-4 transition-all duration-300 ease-out',
            isSensitiveHidden
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-50 opacity-0',
          )}
          />
        </span>
    </PlatformIconButton>
  );
}
