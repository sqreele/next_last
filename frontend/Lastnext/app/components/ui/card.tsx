import * as React from "react";
import { cn } from "@/app/lib/utils/cn";

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "mobile" | "tablet" | "interactive";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "w-full max-w-none rounded-[var(--pcms-radius)] border border-[var(--pcms-border)] bg-white/95 text-[var(--pcms-text)] shadow-[var(--pcms-shadow-card)] backdrop-blur-sm transition-all duration-200",
      {
        "rounded-[1.25rem] shadow-[var(--pcms-shadow-sm)]":
          variant === "mobile",
        "tablet:rounded-[1.5rem] tablet:shadow-[var(--pcms-shadow)]":
          variant === "tablet",
        "cursor-pointer touch-manipulation hover:-translate-y-0.5 hover:border-[var(--pcms-border-strong)] hover:shadow-[var(--pcms-shadow)] active:translate-y-0":
          variant === "interactive",
      },
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col space-y-1.5",
      "p-4 mobile:p-5 tablet:p-6",
      className,
    )}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg mobile:text-xl tablet:text-2xl font-black leading-tight tracking-[-0.025em] text-balance text-[var(--pcms-text)]",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-6 text-[var(--pcms-text-muted)]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("pt-0", "p-4 mobile:p-5 tablet:p-6", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center pt-0",
      "p-4 mobile:p-5 tablet:p-6",
      "flex-col mobile:flex-row gap-2 mobile:gap-4",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
};
