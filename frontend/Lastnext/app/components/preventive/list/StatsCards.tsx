"use client";

import { Settings, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Stats } from "@/app/lib/types/filterTypes";

interface StatsCardsProps {
  stats: Stats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Overdue",
      value: stats.overdue,
      icon: AlertCircle,
      iconClass: "bg-destructive/10 text-destructive",
      valueClass: "text-destructive",
    },
    {
      label: "Open",
      value: stats.pending,
      icon: Clock,
      iconClass: "bg-warning/10 text-warning-foreground",
      valueClass: "text-warning-foreground",
    },
    {
      label: "Total",
      value: stats.total,
      icon: Settings,
      iconClass: "bg-info/10 text-info",
      valueClass: "text-info",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: CheckCircle,
      iconClass: "bg-success/10 text-success",
      valueClass: "text-success",
    },
  ];

  return (
    <section aria-label="Preventive maintenance summary" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-soft sm:p-4"
          >
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:h-10 sm:w-10 ${card.iconClass}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${card.valueClass}`}>
                  {card.value}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
