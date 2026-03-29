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

interface ActualVsBudgetChartProps {
  data: Array<{
    label: string;
    totalelectricity: number | null;
    electricity_cost_budget: number | null;
  }>;
  yearLabel: string;
}

function formatBarLabel(v: number | string | null | undefined) {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  return String(Math.round(n));
}

export default function ActualVsBudgetChart({ data, yearLabel }: ActualVsBudgetChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Actual vs Budget</h3>
        <p className="text-sm text-slate-500">{`Total Electricity vs Budget (${yearLabel})`}</p>
      </div>
      <div className="h-80 w-full min-h-[20rem]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ left: 8, right: 56, top: 8, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis
              dataKey="label"
              type="category"
              width={36}
              stroke="#64748b"
              tick={{ fontSize: 11 }}
            />
            <Tooltip />
            <Legend />
            <Bar dataKey="totalelectricity" name="Actual" fill="#0ea5e9" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="totalelectricity"
                position="right"
                formatter={formatBarLabel}
                className="fill-slate-600 text-[11px] font-medium"
              />
            </Bar>
            <Bar
              dataKey="electricity_cost_budget"
              name="Budget"
              fill="#94a3b8"
              radius={[0, 4, 4, 0]}
            >
              <LabelList
                dataKey="electricity_cost_budget"
                position="right"
                formatter={formatBarLabel}
                className="fill-slate-600 text-[11px] font-medium"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
