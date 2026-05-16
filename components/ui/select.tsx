'use client';

import { cn } from '@/lib/utils';

interface SelectProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Select({ options, value, onChange, className }: SelectProps) {
  return (
    <div className={cn('inline-flex rounded-lg border border-neutral-200 dark:border-neutral-700 p-1 bg-neutral-50 dark:bg-neutral-800/50', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'px-4 py-1.5 text-sm rounded-md transition-all',
            value === option.value
              ? 'bg-white dark:bg-neutral-700 shadow-sm font-medium text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
