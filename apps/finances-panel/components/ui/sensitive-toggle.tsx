'use client';

import { cn } from '../../lib/utils';
import { Button } from './button';

type SensitiveToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
  compact?: boolean;
};

export function SensitiveToggle({
  value,
  onChange,
  compact = false,
}: SensitiveToggleProps) {
  if (compact) {
    return (
      <Button
        type="button"
        size="sm"
        variant={value ? 'primary' : 'secondary'}
        className={cn('h-9 px-3 text-xs')}
        aria-pressed={value}
        aria-label={
          value
            ? 'Show sensitive financial values'
            : 'Hide sensitive financial values'
        }
        onClick={() => onChange(!value)}
      >
        {value ? 'Show Values' : 'Hide Values'}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="default"
      variant={value ? 'primary' : 'secondary'}
      aria-pressed={value}
      aria-label={
        value
          ? 'Show sensitive financial values'
          : 'Hide sensitive financial values'
      }
      onClick={() => onChange(!value)}
    >
      {value ? 'Sensitive On' : 'Sensitive Off'}
    </Button>
  );
}
