'use client';

import { type ButtonHTMLAttributes } from 'react';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from './utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium leading-none transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]',
  {
    variants: {
      variant: {
        primary:
          'border border-transparent bg-primary text-primary-foreground shadow-sm hover:opacity-95',
        secondary:
          'border border-border/70 bg-card text-foreground shadow-sm hover:bg-muted',
        ghost:
          'border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
        danger:
          'border border-transparent bg-destructive text-destructive-foreground shadow-sm hover:opacity-95',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 rounded-lg px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'default',
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    fullWidth?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth = false,
  ...props
}: ButtonProps) {
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
