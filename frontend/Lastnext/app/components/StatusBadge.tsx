"use client";

import * as React from "react";
import { cn } from "@/app/lib/utils/cn";
import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import {
  getStatusConfig,
  normalizeStatusValue,
  type StatusConfig,
} from "@/app/design-system/status-config";

const STATUS_I18N: Record<string, DictKey> = {
  completed: "status.completed",
  verified: "status.verified",
  pending: "status.pending",
  in_progress: "status.inProgress",
  waiting_sparepart: "status.waitingSparepart",
  cancelled: "status.cancelled",
  overdue: "status.overdue",
};

export function normalizeStatus(status?: string) {
  return normalizeStatusValue(status);
}

export function humanize(value?: string) {
  if (!value) return "Unassigned";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getStatusBadgeConfig(status?: string): StatusConfig {
  return getStatusConfig(status);
}

const ACTIVE_STATUSES = new Set([
  "in_progress",
  "waiting_sparepart",
  "waiting_vendor",
  "waiting_fix_defect",
]);

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

export function StatusBadge({
  status,
  className,
  size = "md",
  pulse = false,
  ...props
}: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const config = getStatusConfig(status);
  const { t } = useLocale();
  const i18nKey = STATUS_I18N[normalized];
  const label = i18nKey ? t(i18nKey) : config.label;
  const shouldPulse = pulse && ACTIVE_STATUSES.has(normalized);

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border font-semibold leading-snug",
        size === "sm"
          ? "min-h-6 px-2 py-0.5 text-xs"
          : "min-h-8 px-2.5 py-1 text-sm",
        "whitespace-normal break-words text-left align-middle",
        config.className,
        className,
      )}
      title={config.description}
      {...props}
    >
      <span className="relative flex h-2 w-2 flex-none items-center justify-center">
        {shouldPulse ? (
          <span
            className={cn(
              "absolute h-full w-full animate-ping rounded-full opacity-70 motion-reduce:animate-none",
              config.dotClassName,
            )}
            aria-hidden="true"
          />
        ) : null}
        <span
          className={cn("relative h-2 w-2 rounded-full", config.dotClassName)}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0">{label}</span>
    </span>
  );
}
