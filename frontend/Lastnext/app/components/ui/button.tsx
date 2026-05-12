import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/app/lib/utils/cn";
import { Spinner } from "@/app/components/ui/loading/Spinner";

const buttonVariants = cva(
  "pcms-btn whitespace-nowrap focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/45 focus-visible:ring-offset-2 disabled:pointer-events-none touch-manipulation",
  {
    variants: {
      variant: {
        default: "pcms-btn-primary",
        destructive: "pcms-btn-danger",
        outline: "pcms-btn-secondary",
        secondary: "pcms-btn-secondary",
        success: "pcms-btn-success",
        warning: "pcms-btn-warning",
        ghost: "pcms-btn-ghost",
        link: "h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-4 py-2 mobile:h-11 mobile:px-5",
        sm: "h-10 rounded-[12px] px-3 mobile:h-11 mobile:px-4",
        lg: "h-12 rounded-[14px] px-8 mobile:h-12 mobile:px-10",
        icon: "h-11 w-11 px-0 mobile:h-11 mobile:w-11",
        touch: "min-h-touch-target min-w-touch-target h-11 px-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  formAction?: any;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size, className }),
          isLoading && "cursor-wait",
        )}
        ref={ref}
        aria-busy={isLoading || undefined}
        disabled={!asChild ? disabled || isLoading : undefined}
        {...props}
      >
        {isLoading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner size="sm" />
            {loadingText ?? children}
          </span>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
