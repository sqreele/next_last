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

interface MetricLineChartProps {
  data: Array<{ label: string; value: number | null }>;
  title: string;
  subtitle: string;
  color: string;
  yAxisMax?: number;
}

function formatPointLabel(v: number | string | null | undefined) {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
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
      <div className="h-72 w-full min-h-[18rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 12, top: 28, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={yAxisDomain} />
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
            >
              <LabelList
                dataKey="value"
                position="top"
                formatter={formatPointLabel}
                className="fill-slate-600 text-[11px] font-medium"
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
