"use client";

import React from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface MissingImageProps {
  label?: string;
  className?: string;
  iconClassName?: string;
}

export const MissingImage: React.FC<MissingImageProps> = ({
  label = "No image available",
  className,
  iconClassName,
}) => {
  return (
    <div
      className={cn(
        "w-full h-full bg-muted text-muted-foreground flex items-center justify-center",
        className,
      )}
    >
      <ImageIcon className={cn("w-8 h-8", iconClassName)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
};
