'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { PieLabelRenderProps } from 'recharts';

interface JobPmPieChartProps {
  pmJobs: number;
  nonPmJobs: number;
}

const COLORS = ['#10b981', '#f97316'];

function renderLabel(entry: PieLabelRenderProps) {
  const { name, value, percent } = entry;
  const v = typeof value === 'number' ? value : Number(value);
  const p = typeof percent === 'number' ? percent : Number(percent);
  if (!v || Number.isNaN(v)) return '';
  const pct = Number.isFinite(p) ? (p * 100).toFixed(1) : '0.0';
  return `${name}: ${v} (${pct}%)`;
}

export default function JobPmPieChart({ pmJobs, nonPmJobs }: JobPmPieChartProps) {
  const data = [
    { name: 'PM Jobs', value: pmJobs },
    { name: 'Non-PM Jobs', value: nonPmJobs },
  ];

  const total = pmJobs + nonPmJobs;
  const bestTopic = pmJobs === nonPmJobs ? 'PM & Non-PM (tie)' : pmJobs > nonPmJobs ? 'PM Jobs' : 'Non-PM Jobs';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Job type distribution</h3>
        <p className="text-sm text-slate-500">
          PM vs Non-PM job share
          {total > 0 ? <span className="text-slate-400"> · {total} total</span> : null}.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Best topic: <span className="font-medium text-slate-700">{bestTopic}</span>
        </p>
      </div>
      <div className="h-72 w-full min-h-[18rem]">
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
              label={renderLabel}
            >
              {data.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number | string, name) => {
                const n = typeof value === 'number' ? value : Number(value);
                const share = total > 0 ? ((n / total) * 100).toFixed(1) : '0.0';
                return [`${n} (${share}%)`, name];
              }}
            />
            <Legend formatter={(value) => <span className="text-xs text-slate-700">{value}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
