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

interface PMNonPMBarChartProps {
  data: Array<{ label: string; pm: number; nonPm: number }>;
}

export default function PMNonPMBarChart({ data }: PMNonPMBarChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">PM vs Non-PM by month</h3>
        <p className="text-sm text-slate-500">Compare preventive and reactive tasks.</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Bar dataKey="pm" fill="#10b981" radius={[6, 6, 0, 0]} />
            <Bar dataKey="nonPm" fill="#f97316" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
