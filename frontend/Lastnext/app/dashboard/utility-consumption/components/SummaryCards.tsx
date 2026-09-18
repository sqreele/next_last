"use client";

import {
  describeRelativeCountChange,
  describeSignedRelativeChange,
} from "@/app/lib/dashboard/metricsComparison";
import { useLocale, useT } from "@/app/lib/i18n/LocaleProvider";
import type { DictKey } from "@/app/lib/i18n/dictionary";

export interface UtilitySummary {
  totalkwh: number;
  totalelectricity: number;
  water: number;
  variance: number;
}

export type UtilityComparisonMode = "month_over_month" | "year_over_year";

interface SummaryCardsProps {
  summary: UtilitySummary;
  comparison?: {
    vsLabel: string;
    mode: UtilityComparisonMode;
    previous: UtilitySummary;
  } | null;
  /** Shown above the grid when multiple years are selected (explains baseline). */
  comparisonScopeNote?: string | null;
}

const cards = [
  { key: "totalElectricity", labelKey: "utility.recordedCost", unit: "THB" },
  { key: "totalKwh", labelKey: "utility.electricityConsumption", unit: "kWh" },
  {
    key: "water",
    labelKey: "utility.waterConsumption",
    unit: "m³",
  },
  {
    key: "variance",
    labelKey: "utility.budgetVariance",
    unit: "THB",
  },
] as const;

type CardKey = (typeof cards)[number]["key"];

function formatNumber(value: number, locale: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "—";
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
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
  current: UtilitySummary;
  previous: UtilitySummary;
  vsLabel: string;
  mode: UtilityComparisonMode;
}) {
  const t = useT();
  const comparisonCaption = mode === "year_over_year" ? t("utility.vsPriorYear") : t("utility.vsPriorMonth");
  if (cardKey === "variance") {
    const insight = describeSignedRelativeChange(
      current.variance,
      previous.variance,
    );
    return (
      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <TrendGlyph direction={insight.direction} />
        <span className="font-medium tabular-nums text-foreground">
          {insight.headline}
        </span>
        <span className="text-muted-foreground">
          {comparisonCaption} ({vsLabel})
        </span>
        {insight.detail ? (
          <span className="w-full text-muted-foreground">{insight.detail}</span>
        ) : null}
      </p>
    );
  }

  const cur =
    cardKey === "totalKwh"
      ? current.totalkwh
      : cardKey === "totalElectricity"
        ? current.totalelectricity
        : current.water;
  const prev =
    cardKey === "totalKwh"
      ? previous.totalkwh
      : cardKey === "totalElectricity"
        ? previous.totalelectricity
        : previous.water;

  const insight = describeRelativeCountChange(cur, prev);

  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <TrendGlyph direction={insight.direction} />
      <span className="font-medium tabular-nums text-foreground">
        {insight.headline}
      </span>
      <span className="text-muted-foreground">
        {comparisonCaption} ({vsLabel})
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
  comparisonScopeNote,
}: SummaryCardsProps) {
  const { locale, t } = useLocale();
  const numberLocale = locale === "th" ? "th-TH" : "en-US";
  const values = {
    totalKwh: formatNumber(summary.totalkwh, numberLocale),
    totalElectricity: formatNumber(summary.totalelectricity, numberLocale),
    water: formatNumber(summary.water, numberLocale),
    variance: formatNumber(summary.variance, numberLocale),
  } as const;

  return (
    <div className="space-y-3">
      {comparisonScopeNote ? (
        <p
          className="rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground"
          role="note"
        >
          {comparisonScopeNote}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="rounded-xl border border-border bg-card p-4 shadow-soft"
          >
            <p className="text-sm font-medium text-muted-foreground">
              {t(card.labelKey as DictKey)}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {values[card.key]} <span className="text-sm font-medium text-muted-foreground">{card.unit}</span>
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
                {t("utility.noComparison")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
