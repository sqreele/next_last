"use client";

import type {
  CardSummary,
  PeriodComparisonMode,
} from "../utils/dashboardAggregate";
import {
  describeRateChange,
  describeRelativeCountChange,
} from "@/app/lib/dashboard/metricsComparison";

interface SummaryCardsProps {
  summary: CardSummary;
  comparison?: {
    vsLabel: string;
    mode: PeriodComparisonMode;
    previous: CardSummary;
  } | null;
}

const cards = [
  { key: "total", label: "Total Jobs", color: "from-sky-500 to-indigo-500" },
  { key: "pm", label: "PM Jobs", color: "from-emerald-500 to-teal-500" },
  { key: "nonPm", label: "Non-PM Jobs", color: "from-amber-500 to-orange-500" },
  {
    key: "completion",
    label: "Completion Rate",
    color: "from-fuchsia-500 to-purple-500",
  },
] as const;

type CardKey = (typeof cards)[number]["key"];

function comparisonCaption(mode: PeriodComparisonMode): string {
  return mode === "year_over_year" ? "vs prior year" : "vs prior month";
}

function TrendGlyph({
  direction,
}: {
  direction: "up" | "down" | "flat" | "new";
}) {
  if (direction === "up") {
    return (
      <span className="text-emerald-600" aria-hidden>
        ▲
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="text-rose-600" aria-hidden>
        ▼
      </span>
    );
  }
  if (direction === "new") {
    return (
      <span className="text-sky-600" aria-hidden>
        ◆
      </span>
    );
  }
  return (
    <span className="text-muted-foreground" aria-hidden>
      —
    </span>
  );
}

function CardComparisonLine({
  cardKey,
  current,
  previous,
  vsLabel,
  mode,
}: {
  cardKey: CardKey;
  current: CardSummary;
  previous: CardSummary;
  vsLabel: string;
  mode: PeriodComparisonMode;
}) {
  if (cardKey === "completion") {
    const insight = describeRateChange(
      current.completionRate,
      previous.completionRate,
    );
    return (
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <TrendGlyph direction={insight.direction} />
        <span className="font-medium tabular-nums text-foreground">
          {insight.headline}
        </span>
        <span className="text-muted-foreground">
          {comparisonCaption(mode)} ({vsLabel})
        </span>
        {insight.detail ? (
          <span className="w-full text-muted-foreground">{insight.detail}</span>
        ) : null}
      </p>
    );
  }

  const cur =
    cardKey === "total"
      ? current.totalJobs
      : cardKey === "pm"
        ? current.pmJobs
        : current.nonPmJobs;
  const prev =
    cardKey === "total"
      ? previous.totalJobs
      : cardKey === "pm"
        ? previous.pmJobs
        : previous.nonPmJobs;

  const insight = describeRelativeCountChange(cur, prev);

  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <TrendGlyph direction={insight.direction} />
      <span className="font-medium tabular-nums text-foreground">
        {insight.headline}
      </span>
      <span className="text-muted-foreground">
        {comparisonCaption(mode)} ({vsLabel})
      </span>
      {insight.detail ? (
        <span className="w-full text-muted-foreground">{insight.detail}</span>
      ) : null}
    </p>
  );
}

export default function SummaryCards({
  summary,
  comparison,
}: SummaryCardsProps) {
  const values = {
    total: summary.totalJobs,
    pm: summary.pmJobs,
    nonPm: summary.nonPmJobs,
    completion: `${summary.completionRate.toFixed(1)}%`,
  } as const;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.key}
          className="rounded-xl border border-border bg-card p-5 shadow-soft"
        >
          <div
            className={`h-1.5 w-12 rounded-full bg-gradient-to-r ${card.color}`}
          />
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            {card.label}
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
            {values[card.key]}
          </p>
          {comparison ? (
            <CardComparisonLine
              cardKey={card.key}
              current={summary}
              previous={comparison.previous}
              vsLabel={comparison.vsLabel}
              mode={comparison.mode}
            />
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Select a year to see period comparison.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
