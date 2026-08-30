import * as React from "react";
import { cn } from "@/app/lib/utils/cn";

export type StayMaintLogoVariant =
  | "mark"
  | "horizontal"
  | "wordmark"
  | "full";

export type StayMaintLogoTone = "brand" | "light" | "dark";

type LogoProps = {
  variant?: StayMaintLogoVariant;
  tone?: StayMaintLogoTone;
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
};

function StayMaintMark({
  tone = "brand",
  className,
}: {
  tone?: StayMaintLogoTone;
  className?: string;
}) {
  const teal = tone === "light" ? "#ffffff" : "#0EA5A5";
  const slate =
    tone === "light" ? "#ffffff" : tone === "dark" ? "#0F2732" : "#1E3A4A";

  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={cn("block shrink-0", className)}
    >
      <path
        fill={teal}
        d="M18 34L58 10 80 22 80 38 59 26 38 38 58 50 58 72 38 60 38 72 58 84 58 106 18 82 18 64 38 76 38 64 18 52Z"
      />
      <path
        fill={slate}
        d="M58 50L84 35 104 47 104 82 85 93 85 59 77 54 77 95 58 106Z"
      />
    </svg>
  );
}

export function Logo({
  variant = "horizontal",
  tone = "brand",
  className,
  markClassName,
  showTagline = false,
}: LogoProps) {
  const textColor =
    tone === "light"
      ? "text-white"
      : tone === "dark"
        ? "text-slate-950"
        : "text-[#1E3A4A]";

  if (variant === "mark") {
    return (
      <span
        className={cn("inline-flex", className)}
        role="img"
        aria-label="StayMaint"
      >
        <StayMaintMark
          tone={tone}
          className={cn("size-10", markClassName)}
        />
      </span>
    );
  }

  if (variant === "wordmark") {
    return (
      <span
        className={cn(
          "inline-flex items-baseline font-semibold tracking-[-0.04em]",
          textColor,
          className,
        )}
        aria-label="StayMaint"
      >
        <span className={tone === "light" ? "text-white" : "text-[#0EA5A5]"}>
          Stay
        </span>
        <span>Maint</span>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <StayMaintMark
        tone={tone}
        className={cn("size-10", markClassName)}
      />

      <span className="min-w-0">
        <span
          className={cn(
            "block text-xl font-semibold leading-none tracking-[-0.04em]",
            textColor,
          )}
        >
          <span className={tone === "light" ? "text-white" : "text-[#0EA5A5]"}>
            Stay
          </span>
          <span>Maint</span>
        </span>

        {(variant === "full" || showTagline) && (
          <span
            className={cn(
              "mt-1 block whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.22em]",
              tone === "light" ? "text-white/70" : "text-slate-500",
            )}
          >
            Maintenance • Operations • Excellence
          </span>
        )}
      </span>
    </span>
  );
}

export { StayMaintMark };
