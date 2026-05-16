'use client';

import { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';

const TabsContext = createContext<{ value: string; onChange: (v: string) => void }>({ value: '', onChange: () => {} });

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const current = value ?? internal;
  const handleChange = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };

  return (
    <TabsContext.Provider value={{ value: current, onChange: handleChange }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="tablist" className={cn('flex border-b border-neutral-200 dark:border-neutral-700', className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);
  const isActive = ctx.value === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onChange(value)}
      className={cn(
        'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
        isActive
          ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300',
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);
  if (ctx.value !== value) return null;

  return (
    <div role="tabpanel" className={cn('mt-2', className)}>
      {children}
    </div>
  );
}
