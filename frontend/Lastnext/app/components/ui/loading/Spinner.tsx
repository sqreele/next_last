import * as React from 'react';
import { cn } from '@/app/lib/utils/cn';

export type SpinnerProps = React.HTMLAttributes<HTMLSpanElement> & {
  size?: 'xs' | 'sm' | 'md' | 'lg';
};

const sizeClass: Record<NonNullable<SpinnerProps['size']>, string> = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function Spinner({ size = 'md', className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent opacity-90',
        sizeClass[size],
        className
      )}
      {...props}
    />
  );
}
