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
          'flex w-full rounded-md border border-input bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
          {
            'h-10 px-3 py-2 mobile:h-11 mobile:px-4 mobile:py-3 mobile:text-base': variant === 'default',
            'h-11 px-4 py-3 text-base rounded-lg mobile:h-12 mobile:px-5 mobile:py-4 mobile:text-lg mobile:rounded-xl': variant === 'mobile',
            'h-10 px-4 py-2 pl-10 rounded-full bg-gray-50 border-gray-200 mobile:h-11 mobile:px-5 mobile:py-3': variant === 'search',
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