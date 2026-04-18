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

interface YoYLineChartProps {
  data: Array<Record<string, number | string | null>>;
  years: number[];
  metricLabel: string;
}

const lineColors = ['#2563eb', '#16a34a', '#f97316', '#9333ea', '#0ea5e9'];

function formatYoYLabel(v: number | string | null | undefined) {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatYoYPercent(v: number | null | undefined) {
  if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return 'N/A';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

export default function YoYLineChart({ data, years, metricLabel }: YoYLineChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">YoY multi-line</h3>
        <p className="text-sm text-slate-500">
          {metricLabel} comparison by year (tooltip shows YoY %).
        </p>
      </div>
      <div className="h-80 w-full min-h-[20rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 12, top: 28, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name, item) => {
                const yearKey = String(name);
                const yoyValue = item?.payload?.[`${yearKey}_yoyPct`];
                const yoyPct =
                  typeof yoyValue === 'number'
                    ? yoyValue
                    : typeof yoyValue === 'string'
                      ? Number(yoyValue)
                      : null;
                return [
                  `${formatYoYLabel(value)} (${formatYoYPercent(yoyPct)})`,
                  `${name}`,
                ];
              }}
              labelFormatter={(label) => `${label} (${metricLabel})`}
            />
            <Legend />
            {years.map((year, index) => (
              <Line
                key={year}
                type="monotone"
                dataKey={`${year}`}
                name={`${year}`}
                stroke={lineColors[index % lineColors.length]}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              >
                <LabelList
                  dataKey={`${year}`}
                  position="top"
                  formatter={(value, _entry) => {
                    const n = typeof value === 'number' ? value : Number(value);
                    if (Number.isNaN(n) || n === 0) return '';
                    return formatYoYLabel(value);
                  }}
                  className="fill-slate-600 text-[10px] font-medium"
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
