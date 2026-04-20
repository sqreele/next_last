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

interface TopicJobsLineChartProps {
  data: Array<{ topic: string; count: number }>;
}

function formatCountLabel(v: number | string) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return String(n);
}

function truncateTopic(topic: string, max = 18) {
  const clean = topic.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export default function TopicJobsLineChart({ data }: TopicJobsLineChartProps) {
  const chartData = data.map((item) => ({
    ...item,
    shortTopic: truncateTopic(item.topic),
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Job count by topic</h3>
        <p className="text-sm text-slate-500">Top topics based on selected period filters.</p>
      </div>
      <div className="h-72 w-full min-h-[18rem]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 8, right: 16, top: 28, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="shortTopic"
              stroke="#64748b"
              tick={{ fontSize: 11 }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={52}
            />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number | string) => [value, 'Jobs']}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.topic ?? ''}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="count"
              name="Jobs"
              stroke="#0ea5e9"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            >
              <LabelList
                dataKey="count"
                position="top"
                formatter={formatCountLabel}
                className="fill-slate-600 text-[11px] font-medium"
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

