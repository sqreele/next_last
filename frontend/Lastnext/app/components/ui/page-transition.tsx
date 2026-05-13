"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/app/lib/utils/cn";

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none",
        className,
      )}
    >
      {children}
    </div>
  );
}
