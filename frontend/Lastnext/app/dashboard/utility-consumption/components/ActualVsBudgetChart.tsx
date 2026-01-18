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

interface ActualVsBudgetChartProps {
  data: Array<{
    label: string;
    totalelectricity: number | null;
    electricity_cost_budget: number | null;
  }>;
  yearLabel: string;
}

export default function ActualVsBudgetChart({ data, yearLabel }: ActualVsBudgetChartProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Actual vs Budget</h3>
        <p className="text-sm text-slate-500">{`Total Electricity vs Budget (${yearLabel})`}</p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Bar dataKey="totalelectricity" name="Actual" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            <Bar
              dataKey="electricity_cost_budget"
              name="Budget"
              fill="#94a3b8"
              radius={[6, 6, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
