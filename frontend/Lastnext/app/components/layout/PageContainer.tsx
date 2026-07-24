import type { HTMLAttributes } from "react";
import { cn } from "@/app/lib/utils/cn";
import { designTokens } from "@/app/design-system/tokens";

export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8",
        designTokens.layout.contentWidth,
        designTokens.layout.pagePadding,
        designTokens.layout.pageGap,
        className,
      )}
      {...props}
    />
  );
}

