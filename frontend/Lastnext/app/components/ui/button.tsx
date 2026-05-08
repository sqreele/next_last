import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/app/lib/utils/cn';

const buttonVariants = cva(
  'pcms-btn whitespace-nowrap focus-visible:outline-none disabled:pointer-events-none touch-manipulation',
  {
    variants: {
      variant: {
        default: 'pcms-btn-primary',
        destructive: 'pcms-btn-danger',
        outline: 'pcms-btn-secondary',
        secondary: 'pcms-btn-secondary',
        success: 'pcms-btn-success',
        warning: 'pcms-btn-warning',
        ghost: 'pcms-btn-ghost',
        link: 'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline active:scale-100'
      },
      size: {
        default: 'h-11 px-4 py-2 mobile:h-11 mobile:px-5',
        sm: 'h-10 rounded-[12px] px-3 mobile:h-11 mobile:px-4',
        lg: 'h-12 rounded-[14px] px-8 mobile:h-12 mobile:px-10',
        icon: 'h-11 w-11 px-0 mobile:h-11 mobile:w-11',
        touch: 'min-h-touch-target min-w-touch-target h-11 px-6'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  formAction?: any;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
