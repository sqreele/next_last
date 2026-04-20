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

interface PMNonPMBarChartProps {
  data: Array<{ label: string; pm: number; nonPm: number }>;
}

function formatBarLabel(v: number | string) {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return String(n);
}

export default function PMNonPMBarChart({ data }: PMNonPMBarChartProps) {
  const hasData = data.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">PM vs Non-PM by month</h3>
        <p className="text-sm text-slate-500">Compare preventive and reactive tasks.</p>
      </div>
      {hasData ? (
        <div className="h-[18rem] w-full min-h-[18rem] sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 8, right: 12, top: 28, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="pm" name="PM" fill="#10b981" radius={[6, 6, 0, 0]}>
                <LabelList
                  dataKey="pm"
                  position="top"
                  formatter={formatBarLabel}
                  className="fill-slate-600 text-[11px] font-medium"
                />
              </Bar>
              <Bar dataKey="nonPm" name="Non-PM" fill="#f97316" radius={[6, 6, 0, 0]}>
                <LabelList
                  dataKey="nonPm"
                  position="top"
                  formatter={formatBarLabel}
                  className="fill-slate-600 text-[11px] font-medium"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[18rem] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
          No PM/Non-PM data for selected filters.
        </div>
      )}
    </div>
  );
}
