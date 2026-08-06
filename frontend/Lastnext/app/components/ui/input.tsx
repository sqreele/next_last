import * as React from 'react';
import { cn } from '@/app/lib/utils/cn';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'mobile' | 'search';
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-lg border border-input bg-background text-sm text-foreground shadow-soft',
          'placeholder:text-muted-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'transition-[border-color,box-shadow,background-color] duration-150',
          'hover:border-foreground/30',
          'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
          'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/20',
          {
            'h-11 px-3.5 py-2 mobile:text-base': variant === 'default',
            'h-12 px-4 py-3 text-base': variant === 'mobile',
            'h-11 px-4 py-2 pl-10 bg-muted/50': variant === 'search',
          },
          'touch-manipulation',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
