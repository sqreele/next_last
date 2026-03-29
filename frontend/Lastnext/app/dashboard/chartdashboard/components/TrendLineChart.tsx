'use client';

import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TrendLineChartProps {
  data: Array<{ label: string; jobs: number }>;
}

function formatJobsLabel(v: number | string) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return String(n);
}

export default function TrendLineChart({ data }: TrendLineChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Jobs trend by month</h3>
        <p className="text-sm text-slate-500">Track overall workload volume.</p>
      </div>
      <div className="h-72 w-full min-h-[18rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 12, top: 28, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="jobs"
              name="Jobs"
              stroke="#6366f1"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            >
              <LabelList
                dataKey="jobs"
                position="top"
                formatter={formatJobsLabel}
                className="fill-slate-600 text-[11px] font-medium"
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
