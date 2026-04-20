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

const colors = ['#22c55e', '#f59e0b', '#ef4444'];

interface StatusPieChartProps {
  data: Array<{ name: string; value: number }>;
}

function renderStatusLabel(entry: PieLabelRenderProps) {
  const { name, value, percent } = entry;
  const v = typeof value === 'number' ? value : Number(value);
  const p = typeof percent === 'number' ? percent : Number(percent);
  if (!v || Number.isNaN(v)) return '';
  const pct = Number.isFinite(p) ? (p * 100).toFixed(1) : '0.0';
  const shortName =
    name === 'Waiting Sparepart'
      ? 'Sparepart'
      : name === 'Waiting Fix Defect'
        ? 'Fix Defect'
        : name;
  return `${shortName}: ${v} (${pct}%)`;
}

export default function StatusPieChart({ data }: StatusPieChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const hasData = total > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Status distribution</h3>
        <p className="text-sm text-slate-500">
          Completed vs pending work status
          {total > 0 ? (
            <span className="text-slate-400"> · {total} total</span>
          ) : null}
          .
        </p>
      </div>
      {hasData ? (
        <div className="h-[18rem] w-full min-h-[18rem] sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                paddingAngle={3}
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
                  return [`${n} (${share}%)`, name];
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-slate-700">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[18rem] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
          No status data for selected filters.
        </div>
      )}
    </div>
  );
}
