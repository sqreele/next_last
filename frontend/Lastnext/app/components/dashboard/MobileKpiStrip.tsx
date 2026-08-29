"use client";

import React from "react";
import Link from "next/link";
import {
  ClipboardList,
  Clock,
  Hammer,
  CheckCircle2,
  ShieldAlert,
  Timer,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/app/lib/utils/cn";
import { useT } from "@/app/lib/i18n/LocaleProvider";

export type KpiTone =
  "primary" | "info" | "warning" | "success" | "danger" | "neutral";

interface KpiInput {
  label: string;
  value: number | string;
  delta?: number | null;
  deltaLabel?: string;
  tone: KpiTone;
  icon: LucideIcon;
  href?: string;
  hint?: string;
}

interface MobileKpiStripProps {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  waitingParts: number;
  completionRate: number;
  /** Week-over-week deltas; positive = up vs previous week. `null` = no comparison available. */
  deltas?: {
    total?: number | null;
    open?: number | null;
    completed?: number | null;
    overdue?: number | null;
  };
  className?: string;
}

const TONE_STYLES: Record<
  KpiTone,
  { card: string; icon: string; value: string }
> = {
  primary: {
    card: "border-primary/25 bg-primary/[0.03]",
    icon: "bg-primary/10 text-primary",
    value: "text-primary",
  },
  info: {
    card: "border-info/25 bg-info/[0.03]",
    icon: "bg-info/10 text-info",
    value: "text-info",
  },
  warning: {
    card: "border-warning/30 bg-warning/[0.04]",
    icon: "bg-warning/10 text-warning-foreground",
    value: "text-warning-foreground",
  },
  success: {
    card: "border-success/25 bg-success/[0.03]",
    icon: "bg-success/10 text-success",
    value: "text-success",
  },
  danger: {
    card: "border-destructive/25 bg-destructive/[0.03]",
    icon: "bg-destructive/10 text-destructive",
    value: "text-destructive",
  },
  neutral: {
    card: "border-border bg-card",
    icon: "bg-muted text-foreground",
    value: "text-foreground",
  },
};

function DeltaPill({
  delta,
  label,
}: {
  delta?: number | null;
  label?: string;
}) {
  if (delta === undefined || delta === null) return null;
  const positive = delta > 0;
  const neutral = delta === 0;
  const Icon = positive ? TrendingUp : neutral ? TrendingUp : TrendingDown;
  const tone = neutral
    ? "bg-muted text-muted-foreground"
    : positive
      ? "bg-success/10 text-success"
      : "bg-destructive/10 text-destructive";
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {positive ? "+" : ""}
      {delta}
      {label ? <span className="hidden sm:inline">&nbsp;{label}</span> : null}
    </span>
  );
}

function KpiCard({ kpi }: { kpi: KpiInput }) {
  const styles = TONE_STYLES[kpi.tone];
  const Icon = kpi.icon;
  const inner = (
    <div
      className={cn(
        "flex h-full w-full min-w-[176px] flex-col gap-3 rounded-xl border p-4 shadow-soft transition-colors",
        styles.card,
        kpi.href ? "hover:border-primary/40 hover:bg-primary/[0.05]" : "",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-lg",
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <DeltaPill delta={kpi.delta ?? undefined} label={kpi.deltaLabel} />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {kpi.label}
        </p>
        <p
          className={cn(
            "text-2xl font-bold leading-none tabular-nums sm:text-3xl",
            styles.value,
          )}
        >
          {kpi.value}
        </p>
        {kpi.hint ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {kpi.hint}
          </p>
        ) : null}
      </div>
      {kpi.href ? (
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
          Open <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
  return kpi.href ? (
    <Link href={kpi.href} className="block snap-start rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      {inner}
    </Link>
  ) : (
    <div className="snap-start">{inner}</div>
  );
}

export function MobileKpiStrip({
  total,
  open,
  inProgress,
  completed,
  overdue,
  waitingParts,
  completionRate,
  deltas = {},
  className,
}: MobileKpiStripProps) {
  const t = useT();
  const kpis: KpiInput[] = [
    {
      label: t("kpi.totalJobs"),
      value: total,
      delta: deltas.total ?? null,
      deltaLabel: "vs last week",
      tone: "primary",
      icon: ClipboardList,
      href: "/dashboard/jobs",
      hint: "All maintenance work",
    },
    {
      label: t("kpi.open"),
      value: open,
      delta: deltas.open ?? null,
      deltaLabel: "new this week",
      tone: "info",
      icon: Clock,
      href: "/dashboard/jobs?status=pending",
      hint: "Needs assignment",
    },
    {
      label: t("kpi.inProgress"),
      value: inProgress,
      tone: "warning",
      icon: Hammer,
      href: "/dashboard/jobs?status=in_progress",
      hint: "Active right now",
    },
    {
      label: t("kpi.completed"),
      value: completed,
      delta: deltas.completed ?? null,
      deltaLabel: "vs last week",
      tone: "success",
      icon: CheckCircle2,
      href: "/dashboard/jobs?status=completed",
      hint: `${completionRate}% ${t("kpi.completionRate").toLowerCase()}`,
    },
    {
      label: t("kpi.overdue"),
      value: overdue,
      delta: deltas.overdue ?? null,
      deltaLabel: "vs last week",
      tone: "danger",
      icon: ShieldAlert,
      href: "/dashboard/jobs?status=overdue",
      hint: "Needs escalation",
    },
    {
      label: t("kpi.waitingParts"),
      value: waitingParts,
      tone: "neutral",
      icon: Timer,
      href: "/dashboard/jobs?status=waiting_sparepart",
      hint: "Blocked on inventory",
    },
  ];

  return (
    <section
      aria-label="Maintenance KPI summary"
      className={cn("-mx-3 px-3 sm:mx-0 sm:px-0", className)}
    >
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:hidden">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="min-w-[180px] flex-none">
            <KpiCard kpi={kpi} />
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-2 gap-3 sm:grid lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
    </section>
  );
}
