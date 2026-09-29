import * as React from "react";

import { cn } from "@/app/lib/utils/cn";

/**
 * Centers a route-level loading state in the currently available page area.
 * Outside the app shell that area is the safe viewport; inside the dashboard
 * it is the space left below its header and subscription banner.
 */
export function PageLoadingFrame({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "pcms-page-loading-frame flex w-full items-center justify-center",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
