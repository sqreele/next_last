"use client";

import { useLocale } from "@/app/lib/i18n/LocaleProvider";
import type { UtilityConsumptionRow } from "../types";
import { getMonthIndex } from "../utils/data";

function change(current: number, previous?: number) {
  if (previous == null || previous === 0) return "—";
  const percent = ((current - previous) / previous) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export default function UtilityRecordsTable({ rows, allRows = rows }: { rows: UtilityConsumptionRow[]; allRows?: UtilityConsumptionRow[] }) {
  const { locale, t } = useLocale();
  const number = new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 2 });
  const ordered = [...rows].sort((a, b) => b.year - a.year || getMonthIndex(b.month) - getMonthIndex(a.month));
  const lookup = new Map(allRows.map((row) => [`${row.year}-${getMonthIndex(row.month)}`, row]));
  const previousCost = (row: UtilityConsumptionRow) => {
    const month = getMonthIndex(row.month);
    return lookup.get(month === 1 ? `${row.year - 1}-12` : `${row.year}-${month - 1}`)?.totalelectricity;
  };

  const columnLabels = [
    `${t("utility.totalKwh")} (kWh)`, `${t("utility.onPeak")} (kWh)`,
    `${t("utility.offPeak")} (kWh)`, `${t("utility.water")} (m³)`,
    `${t("utility.electricityCost")} (THB)`, `${t("utility.budget")} (THB)`,
    t("utility.previousPeriod"),
  ];
  const cells = (row: UtilityConsumptionRow) => columnLabels.map((label, index) => [label, [
    number.format(row.totalkwh), number.format(row.onpeakkwh), number.format(row.offpeakkwh),
    number.format(row.water), number.format(row.totalelectricity),
    number.format(row.electricity_cost_budget), change(row.totalelectricity, previousCost(row)),
  ][index]]);

  return <section aria-labelledby="utility-records-heading" className="rounded-xl border border-border bg-card shadow-soft">
    <div className="border-b border-border p-4 sm:p-5"><h2 id="utility-records-heading" className="text-lg font-semibold text-foreground">{t("utility.monthlyRecords")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("utility.recordsHint")}</p></div>
    <div className="space-y-3 p-4 md:hidden">{ordered.map((row) => <article className="rounded-lg border border-border p-3" key={`${row.year}-${row.month}`}><div className="flex items-center justify-between"><h3 className="font-semibold">{row.month} {row.year}</h3><span className="text-sm font-medium tabular-nums">{change(row.totalelectricity, previousCost(row))}</span></div><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">{cells(row).slice(0, 6).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium tabular-nums">{value}</dd></div>)}</dl></article>)}</div>
    <div className="hidden max-h-[32rem] overflow-auto md:block"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 z-10 bg-muted"><tr><th className="p-3 text-left">{t("utility.month")}</th>{columnLabels.map((label) => <th className="p-3 text-right" key={label}>{label}</th>)}</tr></thead><tbody>{ordered.map((row) => <tr className="border-t border-border" key={`${row.year}-${row.month}`}><td className="p-3 font-medium">{row.month} {row.year}</td>{cells(row).map(([label, value]) => <td className="p-3 text-right tabular-nums" key={label}>{value}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
