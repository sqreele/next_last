import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/lib/utils/cn"

const badgeVariants = cva(
  "inline-flex min-h-[28px] items-center justify-center rounded-full border px-3 py-1 text-xs font-extrabold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,.68),0_1px_2px_rgba(15,23,42,.08)] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[var(--pcms-primary)] bg-[var(--pcms-primary)] text-white",
        secondary:
          "border-[#CBD5E1] bg-white text-[#334155]",
        destructive:
          "border-[var(--pcms-danger-hover)] bg-[var(--pcms-danger)] text-white",
        outline: "border-[#CBD5E1] bg-white text-[#334155]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
