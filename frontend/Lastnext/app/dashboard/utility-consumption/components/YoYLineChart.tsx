'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface YoYLineChartProps {
  data: Array<Record<string, number | string | null>>;
  years: number[];
  metricLabel: string;
}

const lineColors = ['#2563eb', '#16a34a', '#f97316', '#9333ea', '#0ea5e9'];

export default function YoYLineChart({ data, years, metricLabel }: YoYLineChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">YoY multi-line</h3>
        <p className="text-sm text-slate-500">{metricLabel} comparison by year.</p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            {years.map((year, index) => (
              <Line
                key={year}
                type="monotone"
                dataKey={`${year}`}
                stroke={lineColors[index % lineColors.length]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
