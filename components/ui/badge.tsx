import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'academic' | 'web' | 'outline';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
        variant === 'academic' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        variant === 'web' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        variant === 'outline' && 'border border-neutral-300 dark:border-neutral-700',
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';
