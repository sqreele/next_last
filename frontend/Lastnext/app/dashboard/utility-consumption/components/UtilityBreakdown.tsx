"use client";

import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import type { UtilitySummary } from "./SummaryCards";

export default function UtilityBreakdown({ summary }: { summary: UtilitySummary }) {
  const { locale, t } = useLocale();
  const number = new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 0 });
  const rows = [
    {
      label: t("utility.electricity"),
      values: [`${number.format(summary.totalkwh)} kWh`, `${number.format(summary.totalelectricity)} THB`],
    },
    {
      label: t("utility.water"),
      values: [`${number.format(summary.water)} m³`],
    },
  ];

  return <section aria-labelledby="utility-breakdown-heading" className="rounded-xl border border-border bg-card p-4 shadow-soft sm:p-5">
    <div>
      <h2 id="utility-breakdown-heading" className="text-lg font-semibold text-foreground">{t("utility.breakdown")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("utility.breakdownHint")}</p>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {rows.map((row) => <article key={row.label} className="rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="font-semibold text-foreground">{row.label}</h3>
        <div className="mt-2 space-y-1">{row.values.map((value) => <p key={value} className="text-sm tabular-nums text-muted-foreground">{value}</p>)}</div>
      </article>)}
    </div>
  </section>;
}
