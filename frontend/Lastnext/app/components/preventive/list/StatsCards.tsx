"use client";

import { Settings, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Stats } from "@/app/lib/types/filterTypes";

interface StatsCardsProps {
  stats: Stats;
}

export default function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Total",
      value: stats.total,
      icon: Settings,
      color: "text-blue-600",
      bgColor: "text-blue-600",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "text-green-600",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "text-yellow-600",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      icon: AlertCircle,
      color: "text-red-600",
      bgColor: "text-red-600",
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:mb-6 md:grid-cols-4 md:gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-3 transition-shadow hover:shadow-soft sm:p-4"
          >
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Icon className={`h-6 w-6 sm:h-8 sm:w-8 ${card.color}`} />
              </div>
              <div className="ml-2 min-w-0 sm:ml-3">
                <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {card.label}
                </p>
                <p className={`text-xl font-semibold sm:text-2xl ${card.bgColor}`}>
                  {card.value}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
