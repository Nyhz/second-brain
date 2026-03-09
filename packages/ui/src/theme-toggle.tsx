'use client';

import { Moon, Sun } from 'lucide-react';
import { cn } from './utils';

type ThemeMode = 'dark' | 'light';

type ThemeToggleProps = {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  compact?: boolean;
};

export function ThemeToggle({
  value,
  onChange,
  compact = false,
}: ThemeToggleProps) {
  const isLight = value === 'light';

  return (
    <button
      type="button"
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      aria-pressed={isLight}
      title={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      className={cn(
        'group relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-foreground shadow-sm transition-[transform,colors,box-shadow] duration-300 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'active:scale-95',
        compact ? 'h-9 w-9' : 'h-10 w-10',
      )}
      onClick={() => onChange(isLight ? 'dark' : 'light')}
    >
      <span className="sr-only">
        Theme mode is {value}. Activate to switch to {isLight ? 'dark' : 'light'}
        .
      </span>
      <span aria-hidden="true" className="relative h-4 w-4">
        <Sun
          className={cn(
            'absolute inset-0 h-4 w-4 transition-all duration-300 ease-out',
            isLight
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-50 opacity-0',
          )}
        />
        <Moon
          className={cn(
            'absolute inset-0 h-4 w-4 transition-all duration-300 ease-out',
            isLight
              ? '-rotate-90 scale-50 opacity-0'
              : 'rotate-0 scale-100 opacity-100',
          )}
        />
      </span>
    </button>
  );
}
