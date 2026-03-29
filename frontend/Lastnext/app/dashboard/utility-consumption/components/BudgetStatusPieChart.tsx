'use client';

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';

const colors = ['#22c55e', '#f97316'];

interface BudgetStatusPieChartProps {
  data: Array<{ name: string; value: number }>;
  /** When every month in the filter has budget 0 / unset — pie is not a true budget KPI. */
  budgetUnsetForAllMonths?: boolean;
}

function renderStatusLabel(entry: PieLabelRenderProps) {
  const { name, value, percent } = entry;
  const v = typeof value === 'number' ? value : Number(value);
  const p = typeof percent === 'number' ? percent : Number(percent);
  if (!v || Number.isNaN(v)) return '';
  const pct = Number.isFinite(p) ? (p * 100).toFixed(1) : '0.0';
  return `${name}: ${v} (${pct}%)`;
}

export default function BudgetStatusPieChart({
  data,
  budgetUnsetForAllMonths = false,
}: BudgetStatusPieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Budget status by month</h3>
        <p className="text-sm text-slate-500">
          Count of months where actual electricity is within or over budget
          {total > 0 ? (
            <span className="text-slate-400"> · {total} month{total === 1 ? '' : 's'}</span>
          ) : null}
          .
        </p>
        {budgetUnsetForAllMonths && total > 0 ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
            Monthly electricity budget is 0 for every row in this filter. “Within budget” here
            only means actual ≤ 0; set budgets to use this chart as a real target.
          </p>
        ) : null}
      </div>
      <div className="h-72 w-full min-h-[18rem]">
        {total === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No monthly rows in the current filter.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={52}
                paddingAngle={2}
                labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                label={renderStatusLabel}
              >
                {data.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | string, name) => {
                  const n = typeof value === 'number' ? value : Number(value);
                  const share = total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
                  return [`${n} months (${share}%)`, name];
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-slate-700">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
