"use client";

import * as React from "react";
import { cn } from "@/app/lib/utils/cn";
import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import {
  getPriorityConfig,
  normalizePriorityValue,
} from "@/app/design-system/priority-config";

const PRIORITY_I18N: Record<string, DictKey> = {
  low: "priority.low",
  medium: "priority.medium",
  high: "priority.high",
  critical: "priority.critical",
};

export function normalizePriority(priority?: string) {
  return normalizePriorityValue(priority);
}

export interface PriorityBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  priority?: string;
  size?: "sm" | "md";
}

export function PriorityBadge({
  priority,
  size = "md",
  className,
  ...props
}: PriorityBadgeProps) {
  const normalized = normalizePriority(priority);
  const config = getPriorityConfig(priority);
  const { t } = useLocale();
  const dictKey = PRIORITY_I18N[normalized];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border font-semibold leading-snug",
        size === "sm"
          ? "min-h-6 px-2 py-0.5 text-xs"
          : "min-h-8 px-2.5 py-1 text-sm",
        config.className,
        className,
      )}
      title={config.description}
      {...props}
    >
      <Icon className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
      <span className="min-w-0">
        {dictKey ? t(dictKey) : config.label}
      </span>
    </span>
  );
}
