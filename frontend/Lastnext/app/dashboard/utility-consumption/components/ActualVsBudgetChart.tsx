"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/app/lib/i18n/LocaleProvider";

interface ActualVsBudgetChartProps {
  data: Array<{
    label: string;
    totalelectricity: number | null;
    electricity_cost_budget: number | null;
  }>;
  yearLabel: string;
}

function formatAxisValue(v: number | string | null | undefined) {
  if (v == null || v === "") return "0";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}

export default function ActualVsBudgetChart({
  data,
  yearLabel,
}: ActualVsBudgetChartProps) {
  const t = useT();
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-soft sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          {t("utility.actualVsBudget")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("utility.actualVsBudgetHint", { year: yearLabel })}</p>
      </div>
      <div className="h-64 w-full min-w-0 sm:h-80 sm:min-h-[20rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ left: 4, right: 16, top: 12, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              unit=" THB"
              width={68}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickFormatter={formatAxisValue}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value, name) => [
                `฿${Number(Array.isArray(value) ? value[0] : value).toLocaleString()}`,
                name,
              ]}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="totalelectricity"
              name={t("utility.actual")}
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="electricity_cost_budget"
              name={t("utility.budget")}
              stroke="hsl(var(--warning))"
              strokeWidth={3}
              strokeDasharray="7 5"
              dot={{ r: 3, fill: "hsl(var(--warning))", strokeWidth: 0 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
