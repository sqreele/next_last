'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TopUsersChartProps {
  data: Array<{ name: string; pm: number; nonPm: number }>;
}

export default function TopUsersChart({ data }: TopUsersChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Top users</h3>
        <p className="text-sm text-slate-500">PM vs Non-PM jobs by user.</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" stroke="#64748b" />
            <YAxis dataKey="name" type="category" width={120} stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Bar dataKey="pm" stackId="jobs" fill="#10b981" radius={[0, 6, 6, 0]} />
            <Bar dataKey="nonPm" stackId="jobs" fill="#f97316" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
