'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow hover:opacity-95',
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:bg-secondary/85',
        ghost:
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        danger:
          'bg-destructive text-destructive-foreground shadow-sm hover:opacity-95',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    fullWidth?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth = false,
  ...props
}: Props) {
  return (
    <button
      className={cn(
        buttonVariants({ variant, size }),
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
}
