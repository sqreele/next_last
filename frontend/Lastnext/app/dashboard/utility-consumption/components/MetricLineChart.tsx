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

interface MetricLineChartProps {
  data: Array<{ label: string; value: number | null }>;
  title: string;
  subtitle: string;
  color: string;
  yAxisMax?: number;
}

export default function MetricLineChart({
  data,
  title,
  subtitle,
  color,
  yAxisMax,
}: MetricLineChartProps) {
  const yAxisDomain = yAxisMax === undefined ? ['auto', 'auto'] : [0, yAxisMax];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" />
            <YAxis stroke="#64748b" domain={yAxisDomain} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              name={title}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
