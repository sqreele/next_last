'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface TopUsersChartProps {
  data: Array<{ name: string; pm: number; nonPm: number }>;
}

/** Recharts LabelList `content` props (subset used for stacked total). */
function StackedTotalLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  payload?: unknown;
}) {
  const { x, y, width, height, payload } = props;
  if (
    x == null ||
    y == null ||
    width == null ||
    height == null ||
    !payload ||
    typeof payload !== 'object'
  ) {
    return null;
  }
  const row = payload as { pm?: number; nonPm?: number };
  const total = (row.pm ?? 0) + (row.nonPm ?? 0);
  if (total === 0) return null;

  const nx = typeof x === 'number' ? x : Number(x);
  const ny = typeof y === 'number' ? y : Number(y);
  const nw = typeof width === 'number' ? width : Number(width);
  const nh = typeof height === 'number' ? height : Number(height);

  return (
    <text
      x={nx + nw + 8}
      y={ny + nh / 2}
      fill="#475569"
      fontSize={11}
      fontWeight={600}
      dominantBaseline="middle"
      className="tabular-nums"
    >
      {total}
    </text>
  );
}

export default function TopUsersChart({ data }: TopUsersChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Top users</h3>
        <p className="text-sm text-slate-500">PM vs Non-PM jobs by user. Labels show total jobs.</p>
      </div>
      <div className="h-72 w-full min-h-[18rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 48, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} allowDecimals={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={112}
              stroke="#64748b"
              tick={{ fontSize: 11 }}
            />
            <Tooltip />
            <Legend />
            <Bar dataKey="pm" name="PM" stackId="jobs" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="nonPm" name="Non-PM" stackId="jobs" fill="#f97316" radius={[0, 6, 6, 0]}>
              <LabelList dataKey="nonPm" content={StackedTotalLabel} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
