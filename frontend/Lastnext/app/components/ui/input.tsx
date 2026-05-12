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
          'flex w-full rounded-xl border border-slate-300 bg-white text-sm text-slate-900 shadow-sm',
          'placeholder:text-slate-400 file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'transition-[border-color,box-shadow,background-color] duration-150',
          'hover:border-slate-400',
          'focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/15',
          'disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-slate-50',
          'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus-visible:ring-red-500/15',
          {
            'h-11 px-3.5 py-2 mobile:h-12 mobile:px-4 mobile:text-base': variant === 'default',
            'h-12 px-4 py-3 text-base mobile:h-12 mobile:px-5 mobile:text-base': variant === 'mobile',
            'h-11 px-4 py-2 pl-10 rounded-full bg-slate-50 border-slate-200 mobile:h-12 mobile:px-5': variant === 'search',
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