import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/app/lib/utils/cn";
import { Spinner } from "@/app/components/ui/loading/Spinner";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-semibold transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-soft hover:border-[hsl(var(--primary-hover))] hover:bg-[hsl(var(--primary-hover))]",
        destructive: "border-destructive bg-destructive text-destructive-foreground shadow-soft hover:border-[hsl(var(--destructive-hover))] hover:bg-[hsl(var(--destructive-hover))]",
        outline: "border-border bg-background text-foreground shadow-soft hover:border-primary/30 hover:bg-primary/10 hover:text-primary",
        secondary: "border-secondary bg-secondary text-secondary-foreground hover:border-[hsl(var(--secondary-hover))] hover:bg-[hsl(var(--secondary-hover))]",
        success: "border-success bg-success text-success-foreground shadow-soft hover:border-[hsl(var(--success-hover))] hover:bg-[hsl(var(--success-hover))]",
        warning: "border-warning bg-warning text-warning-foreground shadow-soft hover:border-[hsl(var(--warning-hover))] hover:bg-[hsl(var(--warning-hover))]",
        ghost: "border-transparent bg-transparent text-foreground shadow-none hover:bg-primary/10 hover:text-primary",
        link: "h-auto min-h-0 rounded-none border-0 bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:text-[hsl(var(--primary-hover))] hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-10 min-h-10 px-3",
        lg: "h-12 px-6",
        icon: "h-11 w-11 px-0",
        touch: "h-11 min-w-touch-target px-5",
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
  formAction?: React.ButtonHTMLAttributes<HTMLButtonElement>["formAction"];
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
