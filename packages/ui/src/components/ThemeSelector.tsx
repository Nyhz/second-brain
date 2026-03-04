'use client';

import { cn } from '../lib/cn';

type ThemeMode = 'dark' | 'light';

type ThemeSelectorProps = {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
  compact?: boolean;
};

export function ThemeSelector({
  value,
  onChange,
  compact = false,
}: ThemeSelectorProps) {
  if (compact) {
    return (
      <select
        className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        value={value}
        onChange={(event) => onChange(event.target.value as ThemeMode)}
        aria-label="Theme mode"
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>
    );
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Theme mode">
      <button
        type="button"
        className={cn(
          'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
          value === 'dark'
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        onClick={() => onChange('dark')}
      >
        Dark
      </button>
      <button
        type="button"
        className={cn(
          'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
          value === 'light'
            ? 'bg-primary text-primary-foreground'
            : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
        onClick={() => onChange('light')}
      >
        Light
      </button>
    </div>
  );
}
